import env from '../../config/env.js';

export const bullmqConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};
