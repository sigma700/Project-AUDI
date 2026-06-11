import cron from 'node-cron';
import db from '../../infrastructure/db/client.js';
import { queueBoth } from './notifications.queue.js';

export function startReminderScheduler() {
  // Run every day at 9am
  cron.schedule('0 9 * * *', async () => {
    console.log('Running repayment reminder scheduler...');
    await sendDueReminders();
    await sendOverdueAlerts();
  });

  console.log('✅ Reminder scheduler started');
}

async function sendDueReminders() {
  // Loans due in exactly 1 day
  const { rows } = await db.query(
    `SELECT
      l.id, l.user_id, l.total_payable, l.due_date,
      u.phone
    FROM loans l
    JOIN users u ON u.id = l.user_id
    WHERE l.status = 'disbursed'
    AND l.due_date = CURRENT_DATE + INTERVAL '1 day'
    AND u.deleted_at IS NULL`
  );

  for (const loan of rows) {
    await queueBoth(loan.user_id, 'REPAYMENT_REMINDER', {
      amount: loan.total_payable,
      dueDate: new Date(loan.due_date).toLocaleDateString('en-KE'),
    });
    console.log(`Reminder queued for loan ${loan.id}`);
  }

  console.log(`Sent ${rows.length} due reminders`);
}

async function sendOverdueAlerts() {
  // Mark overdue loans and alert users
  const { rows } = await db.query(
    `UPDATE loans
     SET status = 'overdue', updated_at = NOW()
     WHERE status = 'disbursed'
     AND due_date < CURRENT_DATE
     RETURNING id, user_id, total_payable, due_date`
  );

  for (const loan of rows) {
    await queueBoth(loan.user_id, 'REPAYMENT_OVERDUE', {
      amount: loan.total_payable,
      dueDate: new Date(loan.due_date).toLocaleDateString('en-KE'),
    });
    console.log(`Overdue alert queued for loan ${loan.id}`);
  }

  console.log(`Processed ${rows.length} overdue loans`);
}
