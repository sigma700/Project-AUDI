import { Worker } from 'bullmq';
import { bullmqConnection } from '../../infrastructure/redis/bullmq.js';
import { processNotification } from './notifications.service.js';

let worker;

export function startNotificationsWorker() {
  worker = new Worker(
    'notifications',
    async (job) => {
      console.log(`Processing notification job: ${job.id} type: ${job.name}`);
      return await processNotification(job);
    },
    {
      connection: bullmqConnection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ Notification sent: ${job.id} — ${job.name}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Notification failed: ${job.id} — ${err.message}`);
  });

  console.log('✅ Notifications worker started');
  return worker;
}

export function stopNotificationsWorker() {
  if (worker) return worker.close();
}
