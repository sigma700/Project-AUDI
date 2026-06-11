export const TEMPLATES = {
  LOAN_APPROVED: {
    sms: (data) =>
      `CashNow: Your loan of KES ${data.amount} has been approved. Disbursement to your M-Pesa will be processed shortly. Ref: ${data.loanId}`,
    push: {
      title: 'Loan Approved 🎉',
      body: (data) => `KES ${data.amount} approved. Processing disbursement now.`,
    },
  },
  LOAN_DISBURSED: {
    sms: (data) =>
      `CashNow: KES ${data.amount} has been sent to your M-Pesa ${data.phone}. M-Pesa Ref: ${data.mpesaRef}. Repay by ${data.dueDate}.`,
    push: {
      title: 'Money Sent 💸',
      body: (data) => `KES ${data.amount} sent to your M-Pesa. Due: ${data.dueDate}`,
    },
  },
  REPAYMENT_REMINDER: {
    sms: (data) =>
      `CashNow: Reminder - Your loan of KES ${data.amount} is due on ${data.dueDate}. Pay via M-Pesa Paybill ${data.paybill}. Avoid penalties by paying on time.`,
    push: {
      title: 'Payment Reminder ⏰',
      body: (data) => `KES ${data.amount} due on ${data.dueDate}. Pay now to avoid penalties.`,
    },
  },
  REPAYMENT_OVERDUE: {
    sms: (data) =>
      `CashNow: URGENT - Your loan of KES ${data.amount} is overdue since ${data.dueDate}. Pay immediately via M-Pesa Paybill ${data.paybill} to avoid CRB listing.`,
    push: {
      title: 'Loan Overdue ⚠️',
      body: (data) => `KES ${data.amount} overdue. Pay now to avoid CRB listing.`,
    },
  },
  REPAYMENT_CONFIRMED: {
    sms: (data) =>
      `CashNow: Payment of KES ${data.amount} received. M-Pesa Ref: ${data.mpesaRef}. ${data.remaining > 0 ? `Balance: KES ${data.remaining}` : 'Loan fully repaid. Thank you!'}`,
    push: {
      title: 'Payment Received ✅',
      body: (data) =>
        data.remaining > 0
          ? `KES ${data.amount} received. Balance: KES ${data.remaining}`
          : 'Loan fully repaid. Thank you!',
    },
  },
  LOAN_REJECTED: {
    sms: (data) =>
      `CashNow: Your loan application was not approved at this time. ${data.reason ? `Reason: ${data.reason}.` : ''} Complete your KYC or improve your repayment history to increase your limit.`,
    push: {
      title: 'Application Update',
      body: () => 'Your loan application was not approved. Tap to learn more.',
    },
  },
  OTP: {
    sms: (data) =>
      `CashNow: Your verification code is ${data.otp}. Valid for 5 minutes. Do not share this code with anyone.`,
  },
};

export const PAYBILL = process.env.DARAJA_SHORTCODE || '174379';
