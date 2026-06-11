import { Queue } from 'bullmq';
import redis from '../../infrastructure/redis/client.js';
import { bullmqConnection } from '../../infrastructure/redis/bullmq.js';

export const notificationsQueue = new Queue('notifications', {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export async function queueNotification(type, channel, userId, data, options = {}) {
  const job = await notificationsQueue.add(
    type,
    { type, channel, userId, data },
    {
      delay: options.delay || 0,
      priority: options.priority || 1,
    }
  );

  return job.id;
}

export async function queueSms(userId, template, data, options = {}) {
  return queueNotification(template, 'sms', userId, data, options);
}

export async function queuePush(userId, template, data, options = {}) {
  return queueNotification(template, 'push', userId, data, options);
}

export async function queueBoth(userId, template, data, options = {}) {
  await queueSms(userId, template, data, options);
  await queuePush(userId, template, data, options);
}
