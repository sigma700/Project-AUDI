// ─── TIER CONFIG ─────────────────────────────────────────────────────────────

const TIERS = [
  {
    name: 'platinum',
    minScore: 700,
    maxScore: 1000,
    minLimit: 35001,
    maxLimit: 50000,
  },
  {
    name: 'gold',
    minScore: 500,
    maxScore: 699,
    minLimit: 25001,
    maxLimit: 35000,
  },
  {
    name: 'silver',
    minScore: 300,
    maxScore: 499,
    minLimit: 15001,
    maxLimit: 25000,
  },
  {
    name: 'bronze',
    minScore: 0,
    maxScore: 299,
    minLimit: 10000,
    maxLimit: 15000,
  },
];

// ─── SCORING WEIGHTS ─────────────────────────────────────────────────────────

const WEIGHTS = {
  KYC_VERIFIED: 200,
  PER_ON_TIME_PAYMENT: 30,
  MAX_ON_TIME_BONUS: 300,
  PER_MISSED_PAYMENT_PENALTY: 50,
  MAX_MISSED_PENALTY: 200,
  PER_30_DAYS_ACCOUNT_AGE: 10,
  MAX_AGE_BONUS: 100,
  ACTIVE_LOAN_PENALTY: 100,
  PER_1000_KES_REPAID: 5,
  MAX_REPAID_BONUS: 100,
  PHONE_VERIFIED: 100,
};

// ─── ENGINE ──────────────────────────────────────────────────────────────────

export function calculateScore(data) {
  const {
    kycVerified,
    onTimePayments,
    missedPayments,
    accountAgeDays,
    activeLoans,
    totalRepaid,
    phoneVerified,
  } = data;

  let score = 0;
  const breakdown = {};

  // KYC verified
  const kycPoints = kycVerified ? WEIGHTS.KYC_VERIFIED : 0;
  score += kycPoints;
  breakdown.kyc = kycPoints;

  // On time payments
  const onTimePoints = Math.min(
    onTimePayments * WEIGHTS.PER_ON_TIME_PAYMENT,
    WEIGHTS.MAX_ON_TIME_BONUS
  );
  score += onTimePoints;
  breakdown.onTimePayments = onTimePoints;

  // Missed payment penalties
  const missedPenalty = Math.min(
    missedPayments * WEIGHTS.PER_MISSED_PAYMENT_PENALTY,
    WEIGHTS.MAX_MISSED_PENALTY
  );
  score -= missedPenalty;
  breakdown.missedPaymentsPenalty = -missedPenalty;

  // Account age bonus
  const ageBonus = Math.min(
    Math.floor(accountAgeDays / 30) * WEIGHTS.PER_30_DAYS_ACCOUNT_AGE,
    WEIGHTS.MAX_AGE_BONUS
  );
  score += ageBonus;
  breakdown.accountAge = ageBonus;

  // Active loan penalty
  const activeLoanPenalty = activeLoans > 1 ? WEIGHTS.ACTIVE_LOAN_PENALTY : 0;
  score -= activeLoanPenalty;
  breakdown.activeLoansPenalty = -activeLoanPenalty;

  // Total repaid bonus
  const repaidBonus = Math.min(
    Math.floor(totalRepaid / 1000) * WEIGHTS.PER_1000_KES_REPAID,
    WEIGHTS.MAX_REPAID_BONUS
  );
  score += repaidBonus;
  breakdown.totalRepaid = repaidBonus;

  // Phone verified
  const phonePoints = phoneVerified ? WEIGHTS.PHONE_VERIFIED : 0;
  score += phonePoints;
  breakdown.phoneVerified = phonePoints;

  // Clamp score between 0 and 1000
  score = Math.max(0, Math.min(1000, score));

  return { score: Math.round(score), breakdown };
}

export function getTier(score) {
  return TIERS.find((t) => score >= t.minScore && score <= t.maxScore);
}

export function calculateLimit(score, totalRepaid) {
  const tier = getTier(score);

  // Base limit starts at tier minimum
  let limit = tier.minLimit;

  // Gradually increase limit within tier based on score position
  const scoreRange = tier.maxScore - tier.minScore;
  const limitRange = tier.maxLimit - tier.minLimit;
  const scorePosition = score - tier.minScore;
  const limitIncrease = Math.floor((scorePosition / scoreRange) * limitRange);

  limit += limitIncrease;

  // Small bonus for high repayment history — max 10% on top
  const repaidBonus = Math.min(Math.floor(totalRepaid / 10000) * 500, tier.maxLimit * 0.1);
  limit += repaidBonus;

  // Never exceed tier maximum
  limit = Math.min(limit, tier.maxLimit);

  return Math.round(limit);
}
