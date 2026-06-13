import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRouter from './modules/auth/auth.routes.js';
import creditRouter from './modules/credit/credit.routes.js';
import paymentsRouter from './modules/payments/payments.routes.js';

import loansRouter from './modules/loans/loans.routes.js';
import usersRouter from './modules/users/user.routes.js';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import notificationsRouter from './modules/notifications/notifications.routes.js';

import { errorHandler } from './middleware/errorHandler.js';
import env from './config/env.js';
import adminRouter from './modules/admin/admin.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin:
        env.NODE_ENV === 'production'
          ? ['https://cashnow.co.ke']
          : ['http://localhost:3001', 'http://localhost:3000'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: env.APP_NAME,
      env: env.NODE_ENV,
    });
  });

  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/loans', loansRouter);
  app.use('/api/v1/credit', creditRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use('/api/v1/notifications', notificationsRouter);

  console.log('✅ paymentsRouter mounted');
  app.use(errorHandler);
  return app;
}
