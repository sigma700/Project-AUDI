import { createClient } from 'redis';
import env from '../../config/env.js';

const redis = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    keepAlive: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Redis: max reconnect attempts reached');
      return Math.min(retries * 100, 3000);
    },
  },
  disableOfflineQueue: false,
});

redis.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

redis.on('reconnecting', () => console.log('Redis reconnecting...'));

export default redis;
