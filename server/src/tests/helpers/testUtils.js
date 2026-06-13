import db from '../../infrastructure/db/client.js';
import redis from '../../infrastructure/redis/client.js';

export async function cleanupTestUser(phone) {
  const { rows } = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);

  if (rows.length > 0) {
    const userId = rows[0].id;
    await db.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM repayments WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM loans WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM credit_profiles WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  await redis.del(`otp:${phone}`);
}

export async function getOtpFromRedis(phone) {
  const raw = await redis.get(`otp:${phone}`);
  return raw ? JSON.parse(raw) : null;
}

export async function closeConnections() {
  await db.end();
  await redis.quit();
}
