CREATE TABLE repayments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  channel VARCHAR(20) NOT NULL DEFAULT 'mpesa'
    CHECK (channel IN ('mpesa', 'bank', 'cash', 'internal')),
  mpesa_ref VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed', 'reversed')),
  paid_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repayments_loan_id ON repayments(loan_id);
CREATE INDEX idx_repayments_user_id ON repayments(user_id);
CREATE INDEX idx_repayments_mpesa_ref ON repayments(mpesa_ref);
CREATE INDEX idx_repayments_status ON repayments(status);

COMMENT ON TABLE repayments IS 'Repayment records per loan';