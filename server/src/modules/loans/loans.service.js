import db from '../../infrastructure/db/client.js';
import { AppError } from '../../shared/errors/AppError.js';
import { queueBoth } from '../notifications/notifications.queue.js';

// ─── FEE CONFIG ───────────────────────────────────────────────────────────────

const FACILITY_FEE_RATE = 0.03; // 3% of principal
const EXCISE_DUTY_RATE = 0.1; // 10% of facility fee
const CRB_FEE = 150; // flat KES 150

const INTEREST_RATES = {
  bronze: 0.15,
  silver: 0.12,
  gold: 0.1,
  platinum: 0.08,
};

const PROCESSING_FEE_RATE = 0.02;

// ─── CALCULATIONS ─────────────────────────────────────────────────────────────

export function calculateUpfrontFees(principal) {
  const facilityFee = Math.round(principal * FACILITY_FEE_RATE * 100) / 100;
  const exciseDuty = Math.round(facilityFee * EXCISE_DUTY_RATE * 100) / 100;
  const crbFee = CRB_FEE;
  const totalUpfront = Math.round((facilityFee + exciseDuty + crbFee) * 100) / 100;

  return { facilityFee, exciseDuty, crbFee, totalUpfront };
}

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

// ─── ELIGIBILITY CHECK ────────────────────────────────────────────────────────

async function checkEligibility(client, userId, principal) {
  const { rows } = await client.query(
    `SELECT
      u.id, u.status, u.kyc_status, u.phone,
      cp.tier, cp.limit_amount, cp.active_loans, cp.score
    FROM users u
    LEFT JOIN credit_profiles cp ON cp.user_id = u.id
    WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );

  if (rows.length === 0) throw new AppError('User not found', 404);

  const user = rows[0];

  if (user.status === 'suspended' || user.status === 'blacklisted') {
    throw new AppError('Your account is not eligible for loans', 403);
  }

  if (user.active_loans >= 1) {
    throw new AppError(
      'You already have an active loan. Repay it before applying for a new one.',
      400
    );
  }

  if (principal > parseFloat(user.limit_amount)) {
    throw new AppError(`Loan amount exceeds your credit limit of KES ${user.limit_amount}`, 400);
  }

  return user;
}

// ─── APPLY — AUTO APPROVAL ────────────────────────────────────────────────────

export async function applyForLoan(userId, { principal, term_days }) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const user = await checkEligibility(client, userId, principal);
    const terms = calculateLoanTerms(principal, term_days, user.tier);
    const fees = calculateUpfrontFees(principal);

    // Create loan — status is 'pending_fees' until upfront fees are paid
    const { rows: loans } = await client.query(
      `INSERT INTO loans (
        user_id, principal, interest_rate, processing_fee,
        total_payable, term_days, due_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_fees')
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

    // Update active loans count immediately
    await client.query(
      `UPDATE credit_profiles
       SET active_loans    = active_loans + 1,
           total_borrowed  = total_borrowed + $1,
           updated_at      = NOW()
       WHERE user_id = $2`,
      [principal, userId]
    );

    // Record application transaction
    await client.query(
      `INSERT INTO transactions (
        user_id, loan_id, type, direction, amount, description
      ) VALUES ($1, $2, 'fee', 'debit', $3,
        'Upfront fees: facility fee + excise duty + CRB')`,
      [userId, loan.id, fees.totalUpfront]
    );

    await client.query('COMMIT');

    return {
      loan,
      terms,
      fees,
      message: `Loan of KES ${principal} pre-approved. Pay upfront fees of KES ${fees.totalUpfront} to receive your money.`,
      nextStep: 'pay_fees',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── AUTO APPROVE AFTER FEES PAID ────────────────────────────────────────────

export async function autoApproveLoan(loanId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE loans
       SET status      = 'approved',
           approved_at = NOW(),
           updated_at  = NOW()
       WHERE id = $1
       AND status = 'pending_fees'
       RETURNING *, user_id`,
      [loanId]
    );
    // If this was a fee payment (loan is in pending_fees), auto approve
    const { rows: loanStatus } = await client.query('SELECT status FROM loans WHERE id = $1', [
      repayment.loan_id,
    ]);

    if (loanStatus[0]?.status === 'pending_fees') {
      await client.query(
        `UPDATE loans
     SET status = 'approved', approved_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
        [repayment.loan_id]
      );

      // Notify user
      const { rows: loanData } = await client.query('SELECT principal FROM loans WHERE id = $1', [
        repayment.loan_id,
      ]);

      await import('../notifications/notifications.queue.js').then(({ queueBoth }) =>
        queueBoth(repayment.user_id, 'LOAN_APPROVED', {
          amount: loanData[0].principal,
          loanId: repayment.loan_id,
        })
      );
    } else {
      // Regular repayment — update loan status as before
      const fullyPaid = parseFloat(totalRepaid[0].total) >= parseFloat(loans[0].total_payable);

      await client.query(`UPDATE loans SET status = $1, updated_at = NOW() WHERE id = $2`, [
        fullyPaid ? 'paid' : 'partially_paid',
        repayment.loan_id,
      ]);
    }
    if (rows.length === 0) {
      throw new AppError('Loan not found or fees not yet paid', 400);
    }

    const loan = rows[0];

    // Notify user
    await queueBoth(loan.user_id, 'LOAN_APPROVED', {
      amount: loan.principal,
      loanId: loan.id,
    });

    await client.query('COMMIT');
    return loan;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── LIST LOANS ───────────────────────────────────────────────────────────────

export async function getUserLoans(userId, status) {
  const params = [userId];
  let statusFilter = '';

  if (status) {
    params.push(status);
    statusFilter = `AND l.status = $2`;
  }

  const { rows } = await db.query(
    `SELECT
      l.id, l.principal, l.interest_rate, l.processing_fee,
      l.total_payable, l.term_days, l.due_date, l.status,
      l.mpesa_receipt, l.disbursed_at, l.created_at,
      l.approved_at
    FROM loans l
    WHERE l.user_id = $1
    ${statusFilter}
    AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC`,
    params
  );

  return rows;
}

// ─── SINGLE LOAN ──────────────────────────────────────────────────────────────

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

  if (rows.length === 0) throw new AppError('Loan not found', 404);
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
       AND status = 'pending_fees'
       AND deleted_at IS NULL
       RETURNING *`,
      [loanId, userId]
    );

    if (rows.length === 0) {
      throw new AppError('Loan not found or cannot be cancelled at this stage', 400);
    }

    await client.query(
      `UPDATE credit_profiles
       SET active_loans   = GREATEST(active_loans - 1, 0),
           total_borrowed = GREATEST(total_borrowed - $1, 0),
           updated_at     = NOW()
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
