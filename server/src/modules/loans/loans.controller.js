import { applyLoanSchema } from './loans.validator.js';
import { applyForLoan, getUserLoans, getLoanById, cancelLoan } from './loans.service.js';

export async function apply(req, res) {
  const validated = applyLoanSchema.parse(req.body);
  const result = await applyForLoan(req.user.sub, validated);

  res.status(201).json({
    status: 'success',
    message: result.message,
    data: {
      loan: result.loan,
      terms: result.terms,
      fees: result.fees,
    },
  });
}

export async function listLoans(req, res) {
  const { status } = req.query;
  const loans = await getUserLoans(req.user.sub, status);

  res.json({
    status: 'success',
    data: {
      loans,
      count: loans.length,
    },
  });
}

export async function getLoan(req, res) {
  const loan = await getLoanById(req.user.sub, req.params.id);

  res.json({
    status: 'success',
    data: { loan },
  });
}

export async function cancel(req, res) {
  const loan = await cancelLoan(req.user.sub, req.params.id);

  res.json({
    status: 'success',
    message: 'Loan cancelled successfully',
    data: { loan },
  });
}
