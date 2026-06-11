import AfricasTalking from 'africastalking';
import db from '../../infrastructure/db/client.js';
import env from '../../config/env.js';
import { TEMPLATES, PAYBILL } from './templates.js';

// ─── Africa's Talking ─────────────────────────────────────────────────────────

const AT = AfricasTalking({
  apiKey: env.AT_API_KEY,
  username: env.AT_USERNAME,
});

const smsClient = AT.SMS;

// ─── Send SMS ─────────────────────────────────────────────────────────────────

export async function sendSms(phone, message) {
  const normalizedPhone = phone.startsWith('0')
    ? `+254${phone.slice(1)}`
    : phone.startsWith('254')
      ? `+${phone}`
      : phone;

  if (env.NODE_ENV === 'development') {
    console.log(`[SMS DEV] To: ${normalizedPhone}`);
    console.log(`[SMS DEV] Message: ${message}`);
    return { success: true, dev: true };
  }

  const result = await smsClient.send({
    to: [normalizedPhone],
    message,
    from: env.AT_SENDER_ID,
  });

  const recipient = result.SMSMessageData.Recipients[0];

  if (recipient.status !== 'Success') {
    throw new Error(`SMS failed: ${recipient.status}`);
  }

  return { success: true, messageId: recipient.messageId };
}

// ─── Send Push ────────────────────────────────────────────────────────────────

export async function sendPush(fcmToken, title, body) {
  if (!fcmToken) return { success: false, reason: 'No FCM token' };

  if (env.NODE_ENV === 'development') {
    console.log(`[PUSH DEV] To: ${fcmToken.slice(0, 20)}...`);
    console.log(`[PUSH DEV] Title: ${title}`);
    console.log(`[PUSH DEV] Body: ${body}`);
    return { success: true, dev: true };
  }

  // Firebase Admin SDK send
  const { getMessaging } = await import('firebase-admin/messaging');

  const message = {
    token: fcmToken,
    notification: { title, body },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  const response = await getMessaging().send(message);
  return { success: true, messageId: response };
}

// ─── Log notification ─────────────────────────────────────────────────────────

export async function logNotification(userId, channel, template, payload, status, error = null) {
  await db.query(
    `INSERT INTO notifications (
      user_id, channel, template, payload, status,
      sent_at, error_message, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      userId,
      channel,
      template,
      JSON.stringify(payload),
      status,
      status === 'sent' ? new Date() : null,
      error,
    ]
  );
}

// ─── Process notification job ─────────────────────────────────────────────────

export async function processNotification(job) {
  const { type, channel, userId, data } = job.data;

  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown template: ${type}`);

  const { rows } = await db.query('SELECT phone, fcm_token FROM users WHERE id = $1', [userId]);

  if (rows.length === 0) throw new Error(`User not found: ${userId}`);

  const user = rows[0];
  const notifData = { ...data, paybill: PAYBILL };

  try {
    if (channel === 'sms' && template.sms) {
      const message = template.sms(notifData);
      await sendSms(user.phone, message);
      await logNotification(userId, 'sms', type, notifData, 'sent');
    }

    if (channel === 'push' && template.push) {
      const title = template.push.title;
      const body = template.push.body(notifData);
      await sendPush(user.fcm_token, title, body);
      await logNotification(userId, 'push', type, notifData, 'sent');
    }

    return { success: true };
  } catch (err) {
    await logNotification(userId, channel, type, notifData, 'failed', err.message);
    throw err;
  }
}

// ─── Get user notifications ───────────────────────────────────────────────────

export async function getUserNotifications(userId, limit = 20) {
  const { rows } = await db.query(
    `SELECT
      id, channel, template, payload,
      status, sent_at, created_at
    FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2`,
    [userId, limit]
  );

  return rows;
}
