import db from '../../infrastructure/db/client.js';
import { updateProfileSchema } from './user.validator.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

export async function getMe(req, res) {
  const { rows } = await db.query(
    `SELECT
      u.id,
      u.phone,
      u.first_name,
      u.last_name,
      u.email,
      u.date_of_birth,
      u.status,
      u.kyc_status,
      u.created_at,
      cp.score,
      cp.tier,
      cp.limit_amount,
      cp.total_borrowed,
      cp.total_repaid,
      cp.active_loans,
      cp.on_time_payments,
      cp.missed_payments
    FROM users u
    LEFT JOIN credit_profiles cp ON cp.user_id = u.id
    WHERE u.id = $1
    AND u.deleted_at IS NULL`,
    [req.user.sub]
  );

  if (rows.length === 0) {
    throw new NotFoundError('User');
  }

  res.json({
    status: 'success',
    data: { user: rows[0] },
  });
}

export async function updateMe(req, res) {
  const updates = updateProfileSchema.parse(req.body);

  // Build dynamic SET clause
  const fields = Object.keys(updates);
  const values = Object.values(updates);

  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

  values.push(new Date().toISOString()); // updated_at
  values.push(req.user.sub); // WHERE id

  const { rows } = await db.query(
    `UPDATE users
     SET ${setClause}, updated_at = $${fields.length + 1}
     WHERE id = $${fields.length + 2}
     AND deleted_at IS NULL
     RETURNING
       id, phone, first_name, last_name,
       email, date_of_birth, status, kyc_status, updated_at`,
    values
  );

  if (rows.length === 0) {
    throw new NotFoundError('User');
  }

  res.json({
    status: 'success',
    message: 'Profile updated successfully',
    data: { user: rows[0] },
  });
}

export async function deleteMe(req, res) {
  const { rows } = await db.query(
    `UPDATE users
     SET deleted_at = NOW(), updated_at = NOW(), status = 'suspended'
     WHERE id = $1
     AND deleted_at IS NULL
     RETURNING id`,
    [req.user.sub]
  );

  if (rows.length === 0) {
    throw new NotFoundError('User');
  }

  res.clearCookie('refreshToken');

  res.json({
    status: 'success',
    message: 'Account deleted successfully',
  });
}
