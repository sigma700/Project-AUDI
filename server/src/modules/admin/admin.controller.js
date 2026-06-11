import {
  getAllLoans,
  getLoanDetail,
  approveLoan,
  getAllUsers,
  getUserDetail,
  suspendUser,
  getNplReport,
  getPlatformSummary,
} from './admin.service.js';

export async function listLoans(req, res) {
  const { status, page, limit, search } = req.query;
  const result = await getAllLoans({
    status,
    search,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });

  res.json({ status: 'success', data: result });
}

export async function getLoan(req, res) {
  const loan = await getLoanDetail(req.params.id);
  res.json({ status: 'success', data: { loan } });
}

export async function approve(req, res) {
  const loan = await approveLoan(req.params.id, req.user.sub);
  res.json({
    status: 'success',
    message: 'Loan approved successfully',
    data: { loan },
  });
}

// export async function reject(req, res) {
//   const { reason } = req.body;
//   const loan = await rejectLoan(req.params.id, req.user.sub, reason);
//   res.json({
//     status: 'success',
//     message: 'Loan rejected',
//     data: { loan },
//   });
// }

export async function listUsers(req, res) {
  const { page, limit, search, status, kyc_status } = req.query;
  const result = await getAllUsers({
    search,
    status,
    kyc_status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });

  res.json({ status: 'success', data: result });
}

export async function getUser(req, res) {
  const user = await getUserDetail(req.params.id);
  res.json({ status: 'success', data: { user } });
}

export async function suspend(req, res) {
  const { reason } = req.body;
  const user = await suspendUser(req.params.id, req.user.sub, reason);
  res.json({
    status: 'success',
    message: 'User suspended',
    data: { user },
  });
}

export async function nplReport(req, res) {
  const report = await getNplReport();
  res.json({ status: 'success', data: { report } });
}

export async function summary(req, res) {
  const data = await getPlatformSummary();
  res.json({ status: 'success', data });
}
