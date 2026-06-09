CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  principal NUMERIC(12, 2) NOT NULL CHECK (principal > 0),
  interest_rate NUMERIC(5, 4) NOT NULL CHECK (interest_rate > 0),
  processing_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_payable NUMERIC(12, 2) NOT NULL,
  term_days INTEGER NOT NULL CHECK (term_days > 0),
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'approved', 'disbursed',
      'partially_paid', 'paid', 'overdue',
      'defaulted', 'cancelled', 'rejected'
    )),
  disbursement_channel VARCHAR(20) DEFAULT 'mpesa',
  mpesa_receipt VARCHAR(100),
  disbursed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due_date ON loans(due_date);
CREATE INDEX idx_loans_disbursed_at ON loans(disbursed_at);
CREATE INDEX idx_loans_user_status ON loans(user_id, status);

COMMENT ON TABLE loans IS 'Loan applications and lifecycle';