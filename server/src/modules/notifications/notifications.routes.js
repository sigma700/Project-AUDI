import { Router } from 'express';
import { getNotifications, updateFcmToken, testNotification } from './notifications.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.post('/fcm-token', updateFcmToken);
router.post('/test', testNotification);

export default router;
