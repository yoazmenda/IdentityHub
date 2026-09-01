import { Injectable } from '@nestjs/common';
import { getPool, withTenant } from '../config/database';

export interface SessionRow {
  id: string;
  user_id: string;
  organization_id: string;
  expires_at: Date;
  created_at: Date;
}

@Injectable()
export class SessionsDao {
  async create(params: { userId: string; organizationId: string; expiresAt: Date }): Promise<SessionRow> {
    return withTenant(params.organizationId, async (client) => {
      const { rows } = await client.query<SessionRow>(
        `INSERT INTO sessions (user_id, organization_id, expires_at)
         VALUES ($1, $2, $3) RETURNING *`,
        [params.userId, params.organizationId, params.expiresAt],
      );
      return rows[0];
    });
  }

  /** Only returns the session if it's unexpired AND belongs to the claimed org — RLS enforces
   * the latter independently of the WHERE clause here. */
  async findActiveById(id: string, organizationId: string): Promise<SessionRow | null> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<SessionRow>(
        'SELECT * FROM sessions WHERE id = $1 AND organization_id = $2 AND expires_at > NOW()',
        [id, organizationId],
      );
      return rows[0] ?? null;
    });
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await withTenant(organizationId, (client) =>
      client.query('DELETE FROM sessions WHERE id = $1 AND organization_id = $2', [id, organizationId]),
    );
  }

  /** Sweeps expired sessions across every org — the one other legitimately cross-tenant job
   * (alongside the automations scheduler), so it runs on the admin connection. */
  async deleteExpired(): Promise<void> {
    await getPool().query('DELETE FROM sessions WHERE expires_at <= NOW()');
  }
}
