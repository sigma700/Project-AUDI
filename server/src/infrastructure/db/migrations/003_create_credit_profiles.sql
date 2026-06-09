CREATE TABLE credit_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0
    CHECK (score >= 0 AND score <= 1000),
  tier VARCHAR(20) NOT NULL DEFAULT 'bronze'
    CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  limit_amount NUMERIC(12, 2) NOT NULL DEFAULT 500.00,
  total_borrowed NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_repaid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  active_loans INTEGER NOT NULL DEFAULT 0,
  missed_payments INTEGER NOT NULL DEFAULT 0,
  on_time_payments INTEGER NOT NULL DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ,
  crb_reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_profiles_user_id ON credit_profiles(user_id);
CREATE INDEX idx_credit_profiles_tier ON credit_profiles(tier);
CREATE INDEX idx_credit_profiles_score ON credit_profiles(score);

COMMENT ON TABLE credit_profiles IS 'Credit score and loan limit per user';