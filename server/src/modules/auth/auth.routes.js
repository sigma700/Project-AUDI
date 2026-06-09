import { Router } from 'express';
import { requestOtp, verifyOtpHandler, refresh, logout } from './auth.controller.js';

const router = Router();

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtpHandler);
router.post('/refresh', refresh);
router.post('/logout', logout);

export default router;
