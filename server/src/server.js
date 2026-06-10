import 'dotenv/config';
import db from './infrastructure/db/client.js';
import redis from './infrastructure/redis/client.js';
import { runMigrations, runSeeds } from './infrastructure/db/migrate.js';
import { createApp } from './app.js';
import env from './config/env.js';

async function bootstrap() {
  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    await redis.connect();
    console.log('✅ Redis connected');

    setInterval(() => {
      redis.ping().catch((err) => console.error('Redis ping error:', err.message));
    }, 60000);

    await runMigrations();
    console.log('✅ Migrations completed');

    await runSeeds();
    console.log('✅ Seeds completed');

    const app = createApp();

    app.listen(env.PORT, () => {
      console.log(`🚀 ${env.APP_NAME} running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();
