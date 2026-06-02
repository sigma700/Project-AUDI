import 'dotenv/config';
import db from './infrastructure/db/client.js';
import redis from './infrastructure/redis/client.js';
import { runMigrations } from './infrastructure/db/migrate.js';
import { createApp } from './app.js';

import env from './config/env.js';

async function bootstrap() {
  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    await redis.connect();
    console.log('✅ Redis connected');

    await runMigrations();
    console.log('✅ Migrations completed');

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      console.log(`${env.APP_NAME} running on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    return server;
  } catch (err) {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();
