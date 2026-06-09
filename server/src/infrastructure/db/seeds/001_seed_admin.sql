-- Default super admin for development only
-- CHANGE THIS PASSWORD before staging/production
INSERT INTO admin_users (
  email,
  password_hash,
  first_name,
  last_name,
  role,
  is_active
) VALUES (
  'admin@cashnow.co.ke',
  '$2b$12$placeholder_change_before_prod',
  'CashNow',
  'Admin',
  'super_admin',
  true
) ON CONFLICT (email) DO NOTHING;