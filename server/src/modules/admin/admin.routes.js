import { Router } from 'express';
import {
  listLoans,
  getLoan,
  approve,
  listUsers,
  getUser,
  suspend,
  nplReport,
  summary,
} from './admin.controller.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('loan_officer', 'admin', 'super_admin'));

router.get('/loans', listLoans);
router.get('/loans/:id', getLoan);
router.post('/loans/:id/approve', approve);

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.post('/users/:id/suspend', suspend);

router.get('/reports/npl', nplReport);
router.get('/reports/summary', summary);

export default router;
