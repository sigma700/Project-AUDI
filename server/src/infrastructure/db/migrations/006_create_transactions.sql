CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  loan_id UUID REFERENCES loans(id) ON DELETE RESTRICT,
  repayment_id UUID REFERENCES repayments(id) ON DELETE RESTRICT,
  type VARCHAR(30) NOT NULL
    CHECK (type IN (
      'disbursement', 'repayment', 'fee',
      'penalty', 'reversal', 'adjustment'
    )),
  direction VARCHAR(10) NOT NULL
    CHECK (direction IN ('credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(12, 2),
  channel VARCHAR(20) DEFAULT 'mpesa',
  mpesa_receipt VARCHAR(100),
  reference VARCHAR(255),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_loan_id ON transactions(loan_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

COMMENT ON TABLE transactions IS 'Immutable financial audit log';