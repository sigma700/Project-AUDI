import {
  initiateStkPush,
  handleStkCallback,
  handleB2cCallback,
  getLoanPayments,
  initiateFeesPayment,
} from './payments.service.js';

export async function stkPushHandler(req, res) {
  const { loan_id } = req.body;
  const result = await initiateStkPush(req.user.sub, loan_id);

  res.json({
    status: 'success',
    message: 'STK push sent to your phone. Enter your M-Pesa PIN to complete.',
    data: result,
  });
}

export async function stkCallbackHandler(req, res) {
  // Always respond 200 immediately — Safaricom retries if we don't
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  // Process in background
  await handleStkCallback(req.body).catch((err) =>
    console.error('STK callback error:', err.message)
  );
}

export async function feesPaymentHandler(req, res) {
  console.log(req.user);
  console.log('🔥 req.body =', req.body);
  const { loan_id } = req.body;
  const result = await initiateFeesPayment(req.user.sub, loan_id);
  res.json({
    status: 'success',
    message: result.message,
    data: result,
  });
}

export async function b2cCallbackHandler(req, res) {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  await handleB2cCallback(req.body).catch((err) =>
    console.error('B2C callback error:', err.message)
  );
}

export async function b2cTimeoutHandler(req, res) {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

export async function paymentHistory(req, res) {
  const payments = await getLoanPayments(req.user.sub, req.params.loanId);

  res.json({
    status: 'success',
    data: {
      payments,
      count: payments.length,
    },
  });
}
