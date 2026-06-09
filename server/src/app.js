import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRouter from './modules/auth/auth.routes.js';
import usersRouter from './modules/users/user.routes.js';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import env from './config/env.js';

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
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: env.APP_NAME,
      env: env.NODE_ENV,
    });
  });

  // Routers mounted here as modules are built
  // import authRoutes from "./modules/auth/auth.routes.js";
  // app.use("/api/v1/auth", authRoutes);

  app.use(errorHandler);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/auth', authRouter);
  return app;
}
