import 'dotenv/config';
import { Pool } from 'pg';
import { applyMigrations } from './apply';

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await applyMigrations(pool);
  await pool.end();
  console.log('Migrations complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
