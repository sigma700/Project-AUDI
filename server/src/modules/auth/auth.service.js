import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../../infrastructure/db/client.js';
import redis from '../../infrastructure/redis/client.js';
import env from '../../config/env.js';

// ─── OTP ─────────────────────────────────────────────────────────────────────

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createOtp(phone) {
  const otp = generateOtp();
  const hash = await bcrypt.hash(otp, 10);
  const key = `otp:${phone}`;

  // Store in Redis — expires after OTP_TTL_SECONDS
  await redis.setEx(key, env.OTP_TTL_SECONDS, JSON.stringify({ hash, attempts: 0 }));

  return otp;
}

export async function verifyOtp(phone, otp) {
  const key = `otp:${phone}`;
  const raw = await redis.get(key);

  if (!raw) {
    return { success: false, message: 'OTP expired or not found' };
  }

  const { hash, attempts } = JSON.parse(raw);

  if (attempts >= env.OTP_MAX_ATTEMPTS) {
    await redis.del(key);
    return { success: false, message: 'Too many attempts. Request a new OTP.' };
  }

  const match = await bcrypt.compare(otp, hash);

  if (!match) {
    // Increment attempts
    await redis.setEx(key, env.OTP_TTL_SECONDS, JSON.stringify({ hash, attempts: attempts + 1 }));
    return { success: false, message: 'Invalid OTP' };
  }

  // OTP verified — delete it so it can't be reused
  await redis.del(key);
  return { success: true };
}

// ─── USER ─────────────────────────────────────────────────────────────────────

export async function findOrCreateUser(phone) {
  const { rows } = await db.query('SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL', [
    phone,
  ]);

  if (rows.length > 0) return rows[0];

  // New user — create account and credit profile
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: newUser } = await client.query(
      `INSERT INTO users (phone, status, kyc_status)
   VALUES ($1, 'pending', 'unverified')
   ON CONFLICT (phone) DO UPDATE
   SET updated_at = NOW()
   RETURNING *`,
      [phone]
    );

    await client.query(
      `INSERT INTO credit_profiles (user_id, score, tier, limit_amount)
       VALUES ($1, 0, 'bronze', 10000.00) ON CONFLICT (user_id) DO NOTHING`,
      [newUser[0].id]
    );

    await client.query('COMMIT');
    return newUser[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── TOKENS ──────────────────────────────────────────────────────────────────

export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      phone: user.phone,
      status: user.status,
      kyc_status: user.kyc_status,
      type: 'access',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  );
}

export async function generateRefreshToken(userId) {
  const token = uuidv4();
  const key = `refresh:${token}`;

  await redis.setEx(key, env.JWT_REFRESH_TTL, userId);
  return token;
}

export async function rotateRefreshToken(oldToken) {
  const key = `refresh:${oldToken}`;
  const userId = await redis.get(key);

  if (!userId) {
    return { success: false, message: 'Invalid or expired refresh token' };
  }

  // Delete old token
  await redis.del(key);

  // Get user
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [
    userId,
  ]);

  if (rows.length === 0) {
    return { success: false, message: 'User not found' };
  }

  const user = rows[0];
  const accessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(userId);

  return { success: true, accessToken, refreshToken: newRefreshToken, user };
}

export async function revokeRefreshToken(token) {
  const key = `refresh:${token}`;
  await redis.del(key);
}
