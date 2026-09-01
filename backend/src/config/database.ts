import { Pool, PoolClient } from 'pg';

let pool: Pool | undefined;
let appPool: Pool | undefined;

/** Admin/owner connection — migrations, seed, and the handful of pre-auth lookups (find a user
 * by email, an API key by hash) that must run before any org is known, so RLS can't apply. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/** The app's own runtime connection, as the least-privilege `identityhub_app` role — every
 * tenant-scoped DAO query runs through this, so it's subject to Row-Level Security (see the
 * migration). Exported only so the e2e suite can prove the RLS default-deny directly; regular
 * DAO code should always go through `withTenant`. */
export function getAppPool(): Pool {
  if (!appPool) {
    const connectionString = process.env.APP_DATABASE_URL;
    if (!connectionString) {
      throw new Error('APP_DATABASE_URL is not set');
    }
    appPool = new Pool({ connectionString });
  }
  return appPool;
}

/**
 * Runs `fn` inside a transaction with `app.org_id` set for its duration — Postgres's RLS
 * policies read that setting to decide which rows are visible. `set_config(..., true)` is the
 * transaction-scoped equivalent of `SET LOCAL`, but as a regular function call it accepts a
 * query parameter (`SET LOCAL` itself doesn't). It resets automatically at COMMIT/ROLLBACK, so
 * it can never leak into a later request that reuses this connection.
 */
export async function withTenant<T>(organizationId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.org_id', organizationId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
  if (appPool) {
    await appPool.end();
    appPool = undefined;
  }
}
