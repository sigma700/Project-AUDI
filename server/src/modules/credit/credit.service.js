import db from '../../infrastructure/db/client.js';
import { calculateScore, getTier, calculateLimit } from './credit.engine.js';

export async function evaluateUserCredit(userId) {
  // Fetch everything needed to calculate score
  const { rows: users } = await db.query(
    `SELECT
      u.id,
      u.kyc_status,
      u.status,
      u.created_at,
      cp.on_time_payments,
      cp.missed_payments,
      cp.active_loans,
      cp.total_repaid
    FROM users u
    LEFT JOIN credit_profiles cp ON cp.user_id = u.id
    WHERE u.id = $1
    AND u.deleted_at IS NULL`,
    [userId]
  );

  if (users.length === 0) {
    throw new Error('User not found');
  }

  const user = users[0];

  // Calculate account age in days
  const accountAgeDays = Math.floor(
    (new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)
  );

  // Build scoring input
  const scoringData = {
    kycVerified: user.kyc_status === 'verified',
    onTimePayments: user.on_time_payments || 0,
    missedPayments: user.missed_payments || 0,
    accountAgeDays,
    activeLoans: user.active_loans || 0,
    totalRepaid: parseFloat(user.total_repaid) || 0,
    phoneVerified: true, // phone is always verified via OTP
  };

  // Run the engine
  const { score, breakdown } = calculateScore(scoringData);
  const tier = getTier(score);
  const limitAmount = calculateLimit(score, scoringData.totalRepaid);

  // Persist updated credit profile
  await db.query(
    `UPDATE credit_profiles
     SET
       score = $1,
       tier = $2,
       limit_amount = $3,
       last_evaluated_at = NOW(),
       updated_at = NOW()
     WHERE user_id = $4`,
    [score, tier.name, limitAmount, userId]
  );

  return {
    score,
    tier: tier.name,
    limitAmount,
    breakdown,
    scoringData,
  };
}

export async function getCreditProfile(userId) {
  const { rows } = await db.query(
    `SELECT
      cp.score,
      cp.tier,
      cp.limit_amount,
      cp.total_borrowed,
      cp.total_repaid,
      cp.active_loans,
      cp.on_time_payments,
      cp.missed_payments,
      cp.last_evaluated_at
    FROM credit_profiles cp
    WHERE cp.user_id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    throw new Error('Credit profile not found');
  }

  return rows[0];
}
