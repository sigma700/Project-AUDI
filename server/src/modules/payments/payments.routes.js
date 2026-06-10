import { Router } from 'express';
import {
  stkPushHandler,
  stkCallbackHandler,
  b2cCallbackHandler,
  b2cTimeoutHandler,
  paymentHistory,
} from './payments.controller.js';
import { authenticate } from '../auth/auth.middleware.js';
// // console.log('Auth router:', authRouter);
// console.log('Payments router:', paymentsRouter);

const router = Router();

// Public webhook routes — no auth, Safaricom calls these
router.post('/webhooks/stk', stkCallbackHandler);
router.post('/webhooks/b2c', b2cCallbackHandler);
router.post('/webhooks/b2c-timeout', b2cTimeoutHandler);

// Protected routes
router.use(authenticate);
router.post('/stk-push', stkPushHandler);
router.get('/loan/:loanId', paymentHistory);

export default router;
