import { Router } from 'express';
import { getMe, updateMe, deleteMe } from './user.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

const usersRouter = Router();

// All routes protected
usersRouter.use(authenticate);

usersRouter.get('/me', getMe);
usersRouter.patch('/me', updateMe);
usersRouter.delete('/me', deleteMe);

export default usersRouter;
