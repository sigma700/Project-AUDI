import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './client.js';

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await db.query('SELECT id FROM schema_migrations WHERE filename = $1', [file]);

    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    await db.query(sql);

    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);

    console.log(`✅ Migration applied: ${file}`);
  }
}

export async function runSeeds() {
  const env = process.env.NODE_ENV;

  if (env === 'production') return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_seeds (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const seedsDir = path.join(__dirname, 'seeds');

  if (!fs.existsSync(seedsDir)) return;

  const files = fs
    .readdirSync(seedsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await db.query('SELECT id FROM schema_seeds WHERE filename = $1', [file]);

    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');

    await db.query(sql);

    await db.query('INSERT INTO schema_seeds (filename) VALUES ($1)', [file]);

    console.log(`🌱 Seed applied: ${file}`);
  }
}
