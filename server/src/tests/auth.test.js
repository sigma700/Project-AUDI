import request from 'supertest';
import { createApp } from '../app.js';
import db from '../infrastructure/db/client.js';
import redis from '../infrastructure/redis/client.js';
import { cleanupTestUser, closeConnections } from './helpers/testUtils.js';
import bcrypt from 'bcrypt';

const app = createApp();
const TEST_PHONE = '0700111222';

beforeAll(async () => {
  if (!redis.isReady) await redis.connect();
});

afterAll(async () => {
  await cleanupTestUser(TEST_PHONE);
  await closeConnections();
});

afterEach(async () => {
  await cleanupTestUser(TEST_PHONE);
});

describe('Auth — OTP Flow', () => {
  test('POST /request-otp returns success', async () => {
    const res = await request(app).post('/api/v1/auth/request-otp').send({ phone: TEST_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  test('POST /request-otp rejects invalid phone', async () => {
    const res = await request(app).post('/api/v1/auth/request-otp').send({ phone: '123' });

    expect(res.status).toBe(422);
  });

  test('POST /verify-otp succeeds with correct OTP and creates user', async () => {
    // Manually insert a known OTP into Redis
    const otp = '123456';
    const hash = await bcrypt.hash(otp, 10);
    await redis.setEx(`otp:${TEST_PHONE}`, 300, JSON.stringify({ hash, attempts: 0 }));

    const res = await request(app).post('/api/v1/auth/verify-otp').send({ phone: TEST_PHONE, otp });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.phone).toBe(TEST_PHONE);

    // Confirm user was created in DB
    const { rows } = await db.query('SELECT * FROM users WHERE phone = $1', [TEST_PHONE]);
    expect(rows.length).toBe(1);
    expect(rows[0].kyc_status).toBe('unverified');

    // Confirm credit profile created
    const { rows: cp } = await db.query('SELECT * FROM credit_profiles WHERE user_id = $1', [
      rows[0].id,
    ]);
    expect(cp.length).toBe(1);
    expect(cp[0].tier).toBe('bronze');
  });

  test('POST /verify-otp rejects wrong OTP', async () => {
    const correctOtp = '123456';
    const hash = await bcrypt.hash(correctOtp, 10);
    await redis.setEx(`otp:${TEST_PHONE}`, 300, JSON.stringify({ hash, attempts: 0 }));

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: TEST_PHONE, otp: '000000' });

    expect(res.status).toBe(400);
  });

  test('POST /verify-otp rejects expired/missing OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: TEST_PHONE, otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired|not found/i);
  });
});

describe('Auth — Refresh & Logout', () => {
  let refreshToken;
  let cookies;

  beforeEach(async () => {
    const otp = '123456';
    const hash = await bcrypt.hash(otp, 10);
    await redis.setEx(`otp:${TEST_PHONE}`, 300, JSON.stringify({ hash, attempts: 0 }));

    const res = await request(app).post('/api/v1/auth/verify-otp').send({ phone: TEST_PHONE, otp });

    cookies = res.headers['set-cookie'];
  });

  test('POST /refresh issues new access token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('POST /logout clears refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', cookies);

    expect(res.status).toBe(200);

    // Refresh should now fail
    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);

    expect(refreshRes.status).toBe(401);
  });
});
