import db from '../../infrastructure/db/client.js';
import { AppError } from '../../shared/errors/AppError.js';

// ─── INTEREST & FEE CONFIG ────────────────────────────────────────────────────

const INTEREST_RATES = {
  bronze: 0.15, // 15% for 30 days
  silver: 0.12, // 12% for 30 days
  gold: 0.1, // 10% for 30 days
  platinum: 0.08, // 8%  for 30 days
};

const PROCESSING_FEE_RATE = 0.02; // 2% of principal

function calculateLoanTerms(principal, termDays, tier) {
  const dailyRate = INTEREST_RATES[tier] / 30;
  const interest = principal * dailyRate * termDays;
  const processingFee = principal * PROCESSING_FEE_RATE;
  const totalPayable = principal + interest + processingFee;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + termDays);

  return {
    interestRate: dailyRate,
    processingFee: Math.round(processingFee * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    dueDate: dueDate.toISOString().split('T')[0],
  };
}

// ─── APPLY ────────────────────────────────────────────────────────────────────

export async function applyForLoan(userId, { principal, term_days }) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Get user and credit profile
    const { rows: users } = await client.query(
      `SELECT
        u.id,
        u.status,
        u.kyc_status,
        cp.tier,
        cp.limit_amount,
        cp.active_loans,
        cp.score
      FROM users u
      LEFT JOIN credit_profiles cp ON cp.user_id = u.id
      WHERE u.id = $1
      AND u.deleted_at IS NULL`,
      [userId]
    );

    if (users.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = users[0];

    // Eligibility checks
    if (user.status !== 'active' && user.status !== 'pending') {
      throw new AppError('Your account is not eligible for loans', 403);
    }

    if (user.active_loans >= 1) {
      throw new AppError(
        'You already have an active loan. Repay it before applying for a new one.',
        400
      );
    }

    if (principal > parseFloat(user.limit_amount)) {
      throw new AppError(`Loan amount exceeds your limit of KES ${user.limit_amount}`, 400);
    }

    // Calculate loan terms
    const terms = calculateLoanTerms(principal, term_days, user.tier);

    // Create loan
    const { rows: loans } = await client.query(
      `INSERT INTO loans (
        user_id,
        principal,
        interest_rate,
        processing_fee,
        total_payable,
        term_days,
        due_date,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved')
      RETURNING *`,
      [
        userId,
        principal,
        terms.interestRate,
        terms.processingFee,
        terms.totalPayable,
        term_days,
        terms.dueDate,
      ]
    );

    const loan = loans[0];

    // Update active loans count
    await client.query(
      `UPDATE credit_profiles
       SET active_loans = active_loans + 1,
           total_borrowed = total_borrowed + $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [principal, userId]
    );

    // Record transaction
    await client.query(
      `INSERT INTO transactions (
        user_id, loan_id, type, direction, amount, description
      ) VALUES ($1, $2, 'disbursement', 'credit', $3, 'Loan approved and queued for disbursement')`,
      [userId, loan.id, principal]
    );

    await client.query('COMMIT');

    return {
      loan,
      terms,
      message: `Loan of KES ${principal} approved. Disbursement to M-Pesa pending.`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function getUserLoans(userId, status) {
  const params = [userId];
  let statusFilter = '';

  if (status) {
    params.push(status);
    statusFilter = `AND l.status = $2`;
  }

  const { rows } = await db.query(
    `SELECT
      l.id,
      l.principal,
      l.interest_rate,
      l.processing_fee,
      l.total_payable,
      l.term_days,
      l.due_date,
      l.status,
      l.mpesa_receipt,
      l.disbursed_at,
      l.created_at
    FROM loans l
    WHERE l.user_id = $1
    ${statusFilter}
    AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC`,
    params
  );

  return rows;
}

// ─── SINGLE ───────────────────────────────────────────────────────────────────

export async function getLoanById(userId, loanId) {
  const { rows } = await db.query(
    `SELECT
      l.*,
      COALESCE(
        json_agg(r ORDER BY r.created_at DESC)
        FILTER (WHERE r.id IS NOT NULL), '[]'
      ) AS repayments
    FROM loans l
    LEFT JOIN repayments r ON r.loan_id = l.id
    WHERE l.id = $1
    AND l.user_id = $2
    AND l.deleted_at IS NULL
    GROUP BY l.id`,
    [loanId, userId]
  );

  if (rows.length === 0) {
    throw new AppError('Loan not found', 404);
  }

  return rows[0];
}

// ─── CANCEL ───────────────────────────────────────────────────────────────────

export async function cancelLoan(userId, loanId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE loans
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       AND user_id = $2
       AND status = 'pending'
       AND deleted_at IS NULL
       RETURNING *`,
      [loanId, userId]
    );

    if (rows.length === 0) {
      throw new AppError('Loan not found or cannot be cancelled at this stage', 400);
    }

    // Decrement active loans
    await client.query(
      `UPDATE credit_profiles
       SET active_loans = GREATEST(active_loans - 1, 0),
           total_borrowed = GREATEST(total_borrowed - $1, 0),
           updated_at = NOW()
       WHERE user_id = $2`,
      [rows[0].principal, userId]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
