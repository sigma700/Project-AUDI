import request from 'supertest';
import { createApp } from '../app.js';
import db from '../infrastructure/db/client.js';
import redis from '../infrastructure/redis/client.js';
import { cleanupTestUser, closeConnections } from './helpers/testUtils.js';
import { calculateUpfrontFees } from '../modules/loans/loans.service.js';
import bcrypt from 'bcrypt';

const app = createApp();
const TEST_PHONE = '0700333444';
let accessToken;

beforeAll(async () => {
  if (!redis.isReady) await redis.connect();

  const otp = '123456';
  const hash = await bcrypt.hash(otp, 10);
  await redis.setEx(`otp:${TEST_PHONE}`, 300, JSON.stringify({ hash, attempts: 0 }));

  const res = await request(app).post('/api/v1/auth/verify-otp').send({ phone: TEST_PHONE, otp });

  accessToken = res.body.data.accessToken;
});

afterAll(async () => {
  await cleanupTestUser(TEST_PHONE);
  await closeConnections();
});

describe('Fee calculation', () => {
  test('calculateUpfrontFees returns correct breakdown for 10000', () => {
    const fees = calculateUpfrontFees(10000);

    expect(fees.facilityFee).toBe(300); // 3% of 10000
    expect(fees.exciseDuty).toBe(30); // 10% of 300
    expect(fees.crbFee).toBe(150);
    expect(fees.totalUpfront).toBe(480); // 300 + 30 + 150
  });

  test('calculateUpfrontFees scales correctly for 50000', () => {
    const fees = calculateUpfrontFees(50000);

    expect(fees.facilityFee).toBe(1500);
    expect(fees.exciseDuty).toBe(150);
    expect(fees.crbFee).toBe(150);
    expect(fees.totalUpfront).toBe(1800);
  });
});

describe('Loan application flow', () => {
  test('POST /apply rejects amount below minimum', async () => {
    const res = await request(app)
      .post('/api/v1/loans/apply')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ principal: 5000, term_days: 30 });

    expect(res.status).toBe(422);
  });

  test('POST /apply rejects amount above maximum', async () => {
    const res = await request(app)
      .post('/api/v1/loans/apply')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ principal: 60000, term_days: 30 });

    expect(res.status).toBe(422);
  });

  test('POST /apply creates loan with pending_fees status and correct fees', async () => {
    const res = await request(app)
      .post('/api/v1/loans/apply')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ principal: 10000, term_days: 30 });

    expect(res.status).toBe(201);
    expect(res.body.data.loan.status).toBe('pending_fees');
    expect(res.body.data.fees.totalUpfront).toBe(480);
    expect(res.body.data.terms.totalPayable).toBeGreaterThan(10000);
  });

  test('POST /apply rejects second application while one is active', async () => {
    const res = await request(app)
      .post('/api/v1/loans/apply')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ principal: 10000, term_days: 30 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already have an active loan/i);
  });

  test('GET /loans lists the applied loan', async () => {
    const res = await request(app)
      .get('/api/v1/loans')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.loans.length).toBe(1);
    expect(res.body.data.loans[0].status).toBe('pending_fees');
  });

  test('POST /loans/:id/cancel cancels a pending_fees loan', async () => {
    const { rows } = await db.query(
      'SELECT id FROM loans WHERE status = $1 ORDER BY created_at DESC LIMIT 1',
      ['pending_fees']
    );
    const loanId = rows[0].id;

    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.loan.status).toBe('cancelled');
  });

  test('Active loans count returns to 0 after cancel', async () => {
    const { rows } = await db.query(
      `SELECT cp.active_loans FROM credit_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE u.phone = $1`,
      [TEST_PHONE]
    );

    expect(rows[0].active_loans).toBe(0);
  });
});
