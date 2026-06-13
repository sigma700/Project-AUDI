import { calculateScore, getTier, calculateLimit } from '../modules/credit/credit.engine.js';

describe('Credit Engine', () => {
  test('new user with phone verified gets score of 100, bronze tier', () => {
    const { score } = calculateScore({
      kycVerified: false,
      onTimePayments: 0,
      missedPayments: 0,
      accountAgeDays: 0,
      activeLoans: 0,
      totalRepaid: 0,
      phoneVerified: true,
    });

    expect(score).toBe(100);
    expect(getTier(score).name).toBe('bronze');
  });

  test('KYC verified user moves to silver tier', () => {
    const { score } = calculateScore({
      kycVerified: true,
      onTimePayments: 0,
      missedPayments: 0,
      accountAgeDays: 0,
      activeLoans: 0,
      totalRepaid: 0,
      phoneVerified: true,
    });

    expect(score).toBe(300);
    expect(getTier(score).name).toBe('silver');
  });

  test('platinum tier requires score 700+', () => {
    const { score } = calculateScore({
      kycVerified: true,
      onTimePayments: 10, // capped at 300
      missedPayments: 0,
      accountAgeDays: 365, // capped at 100
      activeLoans: 0,
      totalRepaid: 50000, // capped at 100
      phoneVerified: true,
    });

    // 200 + 300 + 100 + 100 + 100 = 800, clamped to 1000
    expect(score).toBeGreaterThanOrEqual(700);
    expect(getTier(score).name).toBe('platinum');
  });

  test('bronze tier limit never goes below 10000', () => {
    const limit = calculateLimit(0, 0);
    expect(limit).toBeGreaterThanOrEqual(10000);
    expect(limit).toBeLessThanOrEqual(15000);
  });

  test('platinum tier limit caps at 50000', () => {
    const limit = calculateLimit(1000, 100000);
    expect(limit).toBeLessThanOrEqual(50000);
  });

  test('missed payments reduce score', () => {
    const { score: cleanScore } = calculateScore({
      kycVerified: true,
      onTimePayments: 0,
      missedPayments: 0,
      accountAgeDays: 0,
      activeLoans: 0,
      totalRepaid: 0,
      phoneVerified: true,
    });

    const { score: missedScore } = calculateScore({
      kycVerified: true,
      onTimePayments: 0,
      missedPayments: 2,
      accountAgeDays: 0,
      activeLoans: 0,
      totalRepaid: 0,
      phoneVerified: true,
    });

    expect(missedScore).toBeLessThan(cleanScore);
  });
});
