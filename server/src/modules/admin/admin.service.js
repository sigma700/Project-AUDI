import db from '../../infrastructure/db/client.js';
import { AppError } from '../../shared/errors/AppError.js';
import { queueBoth } from '../notifications/notifications.queue.js';

// ─── LOANS ────────────────────────────────────────────────────────────────────

export async function getAllLoans({ status, page = 1, limit = 20, search }) {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = ['l.deleted_at IS NULL'];

  if (status) {
    params.push(status);
    conditions.push(`l.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(u.phone ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  params.push(offset);

  const { rows: loans } = await db.query(
    `SELECT
      l.id, l.principal, l.total_payable, l.term_days,
      l.due_date, l.status, l.created_at, l.disbursed_at,
      l.mpesa_receipt, l.interest_rate, l.processing_fee,
      u.id AS user_id, u.phone, u.first_name, u.last_name,
      u.kyc_status, cp.score, cp.tier
    FROM loans l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN credit_profiles cp ON cp.user_id = l.user_id
    ${where}
    ORDER BY l.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) FROM loans l
     JOIN users u ON u.id = l.user_id
     ${where}`,
    countParams
  );

  return {
    loans,
    total: parseInt(countRows[0].count),
    page,
    limit,
    pages: Math.ceil(parseInt(countRows[0].count) / limit),
  };
}

export async function getLoanDetail(loanId) {
  const { rows } = await db.query(
    `SELECT
      l.*,
      u.phone, u.first_name, u.last_name,
      u.id_number, u.kyc_status, u.status AS user_status,
      cp.score, cp.tier, cp.limit_amount,
      cp.on_time_payments, cp.missed_payments,
      COALESCE(
        json_agg(r ORDER BY r.created_at DESC)
        FILTER (WHERE r.id IS NOT NULL), '[]'
      ) AS repayments,
      COALESCE(
        json_agg(t ORDER BY t.created_at DESC)
        FILTER (WHERE t.id IS NOT NULL), '[]'
      ) AS transactions
    FROM loans l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN credit_profiles cp ON cp.user_id = l.user_id
    LEFT JOIN repayments r ON r.loan_id = l.id
    LEFT JOIN transactions t ON t.loan_id = l.id
    WHERE l.id = $1
    GROUP BY l.id, u.phone, u.first_name, u.last_name,
             u.id_number, u.kyc_status, u.status,
             cp.score, cp.tier, cp.limit_amount,
             cp.on_time_payments, cp.missed_payments`,
    [loanId]
  );

  if (rows.length === 0) throw new AppError('Loan not found', 404);
  return rows[0];
}

export async function approveLoan(loanId, adminId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE loans
       SET status      = 'approved',
           approved_at = NOW(),
           approved_by = $1,
           updated_at  = NOW()
       WHERE id = $2
       AND status IN ('pending_fees', 'pending')
       RETURNING *, user_id`,
      [adminId, loanId]
    );

    if (rows.length === 0) {
      throw new AppError('Loan not found or cannot be approved at this stage', 400);
    }

    const loan = rows[0];

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

// ─── USERS ────────────────────────────────────────────────────────────────────

export async function getAllUsers({ page = 1, limit = 20, search, status, kyc_status }) {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = ['u.deleted_at IS NULL'];

  if (status) {
    params.push(status);
    conditions.push(`u.status = $${params.length}`);
  }

  if (kyc_status) {
    params.push(kyc_status);
    conditions.push(`u.kyc_status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(u.phone ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`
    );
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  params.push(limit);
  params.push(offset);

  const { rows: users } = await db.query(
    `SELECT
      u.id, u.phone, u.first_name, u.last_name,
      u.email, u.status, u.kyc_status, u.created_at,
      cp.score, cp.tier, cp.limit_amount,
      cp.total_borrowed, cp.total_repaid,
      cp.active_loans, cp.missed_payments,
      COUNT(l.id) FILTER (WHERE l.deleted_at IS NULL) AS total_loans
    FROM users u
    LEFT JOIN credit_profiles cp ON cp.user_id = u.id
    LEFT JOIN loans l ON l.user_id = u.id
    ${where}
    GROUP BY u.id, cp.score, cp.tier, cp.limit_amount,
             cp.total_borrowed, cp.total_repaid,
             cp.active_loans, cp.missed_payments
    ORDER BY u.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const { rows: countRows } = await db.query(`SELECT COUNT(*) FROM users u ${where}`, countParams);

  return {
    users,
    total: parseInt(countRows[0].count),
    page,
    limit,
    pages: Math.ceil(parseInt(countRows[0].count) / limit),
  };
}

export async function getUserDetail(userId) {
  const { rows } = await db.query(
    `SELECT
      u.*,
      cp.score, cp.tier, cp.limit_amount,
      cp.total_borrowed, cp.total_repaid,
      cp.active_loans, cp.on_time_payments, cp.missed_payments,
      COALESCE(
        json_agg(
          json_build_object(
            'id', l.id, 'principal', l.principal,
            'status', l.status, 'due_date', l.due_date,
            'created_at', l.created_at
          ) ORDER BY l.created_at DESC
        ) FILTER (WHERE l.id IS NOT NULL), '[]'
      ) AS loans
    FROM users u
    LEFT JOIN credit_profiles cp ON cp.user_id = u.id
    LEFT JOIN loans l ON l.user_id = u.id AND l.deleted_at IS NULL
    WHERE u.id = $1
    GROUP BY u.id, cp.score, cp.tier, cp.limit_amount,
             cp.total_borrowed, cp.total_repaid,
             cp.active_loans, cp.on_time_payments, cp.missed_payments`,
    [userId]
  );

  if (rows.length === 0) throw new AppError('User not found', 404);
  return rows[0];
}

export async function suspendUser(userId, adminId, reason) {
  const { rows } = await db.query(
    `UPDATE users
     SET status = 'suspended',
         updated_at = NOW()
     WHERE id = $1
     AND deleted_at IS NULL
     RETURNING id, phone, status`,
    [userId]
  );

  if (rows.length === 0) throw new AppError('User not found', 404);
  return rows[0];
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────

export async function getNplReport() {
  const { rows } = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'disbursed') AS active_loans,
      COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_loans,
      COUNT(*) FILTER (WHERE status = 'defaulted') AS defaulted_loans,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_loans,
      COUNT(*) FILTER (WHERE status NOT IN ('pending','cancelled','rejected')) AS total_loans,
      COALESCE(SUM(principal) FILTER (WHERE status IN ('overdue','defaulted')), 0) AS npl_amount,
      COALESCE(SUM(principal) FILTER (WHERE status NOT IN ('pending','cancelled','rejected')), 0) AS total_portfolio,
      ROUND(
        COALESCE(SUM(principal) FILTER (WHERE status IN ('overdue','defaulted')), 0) /
        NULLIF(SUM(principal) FILTER (WHERE status NOT IN ('pending','cancelled','rejected')), 0) * 100,
        2
      ) AS npl_rate
    FROM loans`
  );

  return rows[0];
}

export async function getPlatformSummary() {
  const [users, loans, repayments, revenue] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE kyc_status = 'verified') AS verified_users,
        COUNT(*) FILTER (WHERE status = 'active') AS active_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_users_30d
      FROM users WHERE deleted_at IS NULL
    `),
    db.query(`
      SELECT
        COUNT(*) AS total_loans,
        COUNT(*) FILTER (WHERE status = 'disbursed') AS active_loans,
        COUNT(*) FILTER (WHERE status = 'paid') AS paid_loans,
        COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_loans,
        COALESCE(SUM(principal) FILTER (WHERE status != 'cancelled'), 0) AS total_disbursed,
        COALESCE(SUM(principal) FILTER (WHERE status = 'disbursed'), 0) AS outstanding_balance,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS loans_30d
      FROM loans
    `),
    db.query(`
      SELECT
        COUNT(*) AS total_repayments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS total_collected
      FROM repayments
    `),
    db.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'fee'), 0) AS total_fees,
        COALESCE(SUM(amount) FILTER (WHERE type = 'repayment'), 0) AS total_repaid
      FROM transactions
    `),
  ]);

  return {
    users: users.rows[0],
    loans: loans.rows[0],
    repayments: repayments.rows[0],
    revenue: revenue.rows[0],
  };
}
