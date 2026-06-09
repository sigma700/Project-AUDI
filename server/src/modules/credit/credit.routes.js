import { Router } from 'express';
import { getProfile, evaluate } from './credit.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.post('/evaluate', evaluate);

export default router;
