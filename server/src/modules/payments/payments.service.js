import db from '../../infrastructure/db/client.js';
import { stkPush, b2cDisbursement } from './daraja.client.js';
import { AppError } from '../../shared/errors/AppError.js';

// ─── STK PUSH ─────────────────────────────────────────────────────────────────

export async function initiateStkPush(userId, loanId) {
  // Get loan and user details
  const { rows } = await db.query(
    `SELECT
      l.id,
      l.principal,
      l.total_payable,
      l.status,
      l.user_id,
      u.phone
    FROM loans l
    JOIN users u ON u.id = l.user_id
    WHERE l.id = $1
    AND l.user_id = $2
    AND l.deleted_at IS NULL`,
    [loanId, userId]
  );

  if (rows.length === 0) {
    throw new AppError('Loan not found', 404);
  }

  const loan = rows[0];

  if (!['disbursed', 'partially_paid', 'overdue'].includes(loan.status)) {
    throw new AppError('This loan is not eligible for repayment', 400);
  }

  // Calculate remaining balance
  const { rows: repaid } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_repaid
     FROM repayments
     WHERE loan_id = $1
     AND status = 'confirmed'`,
    [loanId]
  );

  const remaining = parseFloat(loan.total_payable) - parseFloat(repaid[0].total_repaid);

  if (remaining <= 0) {
    throw new AppError('This loan has already been fully repaid', 400);
  }

  // Trigger STK push
  const result = await stkPush({
    phone: loan.phone,
    amount: remaining,
    loanId: loan.id,
    accountRef: `CASHNOW${loan.id.slice(0, 8).toUpperCase()}`,
  });

  // Create pending repayment record
  await db.query(
    `INSERT INTO repayments (
      loan_id, user_id, amount, channel, status, phone
    ) VALUES ($1, $2, $3, 'mpesa', 'pending', $4)`,
    [loanId, userId, remaining, loan.phone]
  );

  return {
    checkoutRequestId: result.CheckoutRequestID,
    merchantRequestId: result.MerchantRequestID,
    responseDescription: result.ResponseDescription,
    amount: remaining,
  };
}

// ─── DISBURSE LOAN ────────────────────────────────────────────────────────────

export async function disburseLoan(loanId) {
  const { rows } = await db.query(
    `SELECT l.*, u.phone
     FROM loans l
     JOIN users u ON u.id = l.user_id
     WHERE l.id = $1
     AND l.status = 'approved'`,
    [loanId]
  );

  if (rows.length === 0) {
    throw new AppError('Loan not found or not in approved state', 404);
  }

  const loan = rows[0];

  const result = await b2cDisbursement({
    phone: loan.phone,
    amount: loan.principal,
    loanId: loan.id,
  });

  // Update loan status to disbursed
  await db.query(
    `UPDATE loans
     SET status = 'disbursed',
         disbursed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [loanId]
  );

  return result;
}

// ─── STK WEBHOOK ─────────────────────────────────────────────────────────────

export async function handleStkCallback(body) {
  const { Body } = body;
  const { stkCallback } = Body;

  const { ResultCode, CheckoutRequestID, CallbackMetadata } = stkCallback;

  if (ResultCode !== 0) {
    // Payment failed or cancelled by user
    await db.query(
      `UPDATE repayments
       SET status = 'failed', updated_at = NOW()
       WHERE loan_id IN (
         SELECT id FROM loans WHERE id IN (
           SELECT loan_id FROM repayments
           WHERE status = 'pending'
           ORDER BY created_at DESC
           LIMIT 1
         )
       )
       AND status = 'pending'`
    );
    return { success: false };
  }

  // Extract metadata
  const meta = {};
  CallbackMetadata.Item.forEach((item) => {
    meta[item.Name] = item.Value;
  });

  const mpesaRef = meta.MpesaReceiptNumber;
  const amount = meta.Amount;
  const phone = String(meta.PhoneNumber);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Confirm repayment
    const { rows: repayments } = await client.query(
      `UPDATE repayments
       SET status = 'confirmed',
           mpesa_ref = $1,
           paid_at = NOW(),
           confirmed_at = NOW(),
           updated_at = NOW()
       WHERE status = 'pending'
       AND phone LIKE $2
       ORDER BY created_at DESC
       LIMIT 1
       RETURNING *`,
      [mpesaRef, `%${phone.slice(-9)}`]
    );

    if (repayments.length === 0) {
      await client.query('ROLLBACK');
      return { success: false };
    }

    const repayment = repayments[0];

    // Update loan status
    const { rows: loans } = await client.query(`SELECT total_payable FROM loans WHERE id = $1`, [
      repayment.loan_id,
    ]);

    const { rows: totalRepaid } = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM repayments
       WHERE loan_id = $1 AND status = 'confirmed'`,
      [repayment.loan_id]
    );

    const fullyPaid = parseFloat(totalRepaid[0].total) >= parseFloat(loans[0].total_payable);

    await client.query(
      `UPDATE loans
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [fullyPaid ? 'paid' : 'partially_paid', repayment.loan_id]
    );

    // Update credit profile
    if (fullyPaid) {
      await client.query(
        `UPDATE credit_profiles
         SET active_loans = GREATEST(active_loans - 1, 0),
             total_repaid = total_repaid + $1,
             on_time_payments = on_time_payments + 1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [amount, repayment.user_id]
      );
    }

    // Record transaction
    await client.query(
      `INSERT INTO transactions (
        user_id, loan_id, repayment_id, type,
        direction, amount, mpesa_receipt, description
      ) VALUES ($1, $2, $3, 'repayment', 'debit', $4, $5, 'M-Pesa repayment confirmed')`,
      [repayment.user_id, repayment.loan_id, repayment.id, amount, mpesaRef]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── B2C WEBHOOK ─────────────────────────────────────────────────────────────

export async function handleB2cCallback(body) {
  const { Result } = body;

  if (Result.ResultCode !== 0) {
    // Disbursement failed — revert loan to approved
    await db.query(
      `UPDATE loans
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1`,
      [Result.OriginatorConversationID]
    );
    return { success: false };
  }

  const meta = {};
  Result.ResultParameters.ResultParameter.forEach((item) => {
    meta[item.Key] = item.Value;
  });

  const mpesaRef = meta.TransactionReceipt;
  const loanId = Result.ReferenceData.ReferenceItem.Value;

  await db.query(
    `UPDATE loans
     SET mpesa_receipt = $1,
         status = 'disbursed',
         disbursed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [mpesaRef, loanId]
  );

  return { success: true };
}

// ─── PAYMENT HISTORY ─────────────────────────────────────────────────────────

export async function getLoanPayments(userId, loanId) {
  const { rows } = await db.query(
    `SELECT
      r.id,
      r.amount,
      r.channel,
      r.mpesa_ref,
      r.status,
      r.paid_at,
      r.confirmed_at,
      r.created_at
    FROM repayments r
    JOIN loans l ON l.id = r.loan_id
    WHERE r.loan_id = $1
    AND l.user_id = $2
    ORDER BY r.created_at DESC`,
    [loanId, userId]
  );

  return rows;
}
