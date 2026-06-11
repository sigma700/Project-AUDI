import axios from 'axios';
import env from '../../config/env.js';
const BASE_URL =
  env.DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

export async function getDarajaToken() {
  const key = (env.DARAJA_CONSUMER_KEY || '').trim();
  const secret = (env.DARAJA_CONSUMER_SECRET || '').trim();

  console.log('Key length:', key.length);
  console.log('Secret length:', secret.length);

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  console.log('Sending Base64:', credentials);

  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  return res.data.access_token;
}
// ─── STK PUSH ─────────────────────────────────────────────────────────────────

export async function stkPush({ phone, amount, loanId, accountRef }) {
  const token = await getDarajaToken();

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);

  const password = Buffer.from(`${env.DARAJA_SHORTCODE}${env.DARAJA_PASSKEY}${timestamp}`).toString(
    'base64'
  );

  // Normalize phone — convert 07XX to 2547XX
  const normalizedPhone = phone.startsWith('0') ? `254${phone.slice(1)}` : phone.replace('+', '');

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: env.DARAJA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: normalizedPhone,
      PartyB: env.DARAJA_SHORTCODE,
      PhoneNumber: normalizedPhone,
      CallBackURL: `${env.DARAJA_CALLBACK_URL}/api/v1/payments/webhooks/stk`,
      AccountReference: accountRef || loanId,
      TransactionDesc: `CashNow loan repayment for ${loanId}`,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return res.data;
}

// ─── B2C DISBURSEMENT ─────────────────────────────────────────────────────────

export async function b2cDisbursement({ phone, amount, loanId }) {
  const token = await getDarajaToken();

  const normalizedPhone = phone.startsWith('0') ? `254${phone.slice(1)}` : phone.replace('+', '');

  const res = await axios.post(
    `${BASE_URL}/mpesa/b2c/v3/paymentrequest`,
    {
      InitiatorName: env.DARAJA_B2C_INITIATOR,
      SecurityCredential: env.DARAJA_B2C_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: Math.round(amount),
      PartyA: env.DARAJA_SHORTCODE,
      PartyB: normalizedPhone,
      Remarks: `CashNow loan disbursement ${loanId}`,
      QueueTimeOutURL: `${env.DARAJA_CALLBACK_URL}/api/v1/payments/webhooks/b2c-timeout`,
      ResultURL: `${env.DARAJA_CALLBACK_URL}/api/v1/payments/webhooks/b2c`,
      Occasion: loanId,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return res.data;
}
