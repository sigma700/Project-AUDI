import { Router } from 'express';
import { apply, listLoans, getLoan, cancel } from './loans.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.post('/apply', apply);
router.get('/', listLoans);
router.get('/:id', getLoan);
router.post('/:id/cancel', cancel);

export default router;
