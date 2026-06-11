import { getUserNotifications } from './notifications.service.js';
import { queueBoth } from './notifications.queue.js';

export async function getNotifications(req, res) {
  const limit = parseInt(req.query.limit) || 20;
  const notifications = await getUserNotifications(req.user.sub, limit);

  res.json({
    status: 'success',
    data: {
      notifications,
      count: notifications.length,
    },
  });
}

export async function updateFcmToken(req, res) {
  const { fcm_token } = req.body;

  if (!fcm_token) {
    return res.status(400).json({
      status: 'error',
      message: 'fcm_token is required',
    });
  }

  await import('../../infrastructure/db/client.js').then(({ default: db }) =>
    db.query('UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2', [
      fcm_token,
      req.user.sub,
    ])
  );

  res.json({
    status: 'success',
    message: 'FCM token updated',
  });
}

export async function testNotification(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ status: 'error', message: 'Not available in production' });
  }

  await queueBoth(req.user.sub, 'REPAYMENT_REMINDER', {
    amount: 10000,
    dueDate: 'tomorrow',
  });

  res.json({
    status: 'success',
    message: 'Test notification queued — check your console',
  });
}
