import { Pool } from 'pg';
import { applyMigrations } from '../src/migrations/apply';

/** Creates the *_test database (if missing) and brings it up to date. Idempotent. */
export async function ensureTestDatabase(): Promise<void> {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const dbName = testUrl.pathname.replace(/^\//, '');

  const maintenanceUrl = new URL(testUrl.toString());
  maintenanceUrl.pathname = '/postgres';
  const maintenancePool = new Pool({ connectionString: maintenanceUrl.toString() });
  try {
    const { rows } = await maintenancePool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) {
      await maintenancePool.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await maintenancePool.end();
  }

  const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await applyMigrations(testPool);
  } finally {
    await testPool.end();
  }
}

/** Clean slate between test files — every app table, identities reset. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE automation_runs, automations, jira_tickets, jira_connections, api_keys, sessions, findings, users, organizations
    RESTART IDENTITY CASCADE
  `);
}
