import { Injectable } from '@nestjs/common';
import { withTenant } from '../config/database';

export type JiraConnectionStatus = 'active' | 'expired' | 'revoked';

export interface JiraConnectionRow {
  id: string;
  organization_id: string;
  site_url: string;
  cloud_id: string;
  access_token: string; // encrypted at rest, see common/crypto.util.ts
  refresh_token: string; // encrypted at rest
  token_expires_at: Date;
  status: JiraConnectionStatus;
  connected_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class JiraConnectionsDao {
  async findForOrg(organizationId: string): Promise<JiraConnectionRow | null> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<JiraConnectionRow>(
        'SELECT * FROM jira_connections WHERE organization_id = $1',
        [organizationId],
      );
      return rows[0] ?? null;
    });
  }

  /** One connection per org — upserts on the organization_id unique constraint. */
  async upsert(params: {
    organizationId: string;
    siteUrl: string;
    cloudId: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    connectedByUserId: string;
  }): Promise<JiraConnectionRow> {
    return withTenant(params.organizationId, async (client) => {
      const { rows } = await client.query<JiraConnectionRow>(
        `INSERT INTO jira_connections
           (organization_id, site_url, cloud_id, access_token, refresh_token, token_expires_at, status, connected_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         ON CONFLICT (organization_id) DO UPDATE SET
           site_url = EXCLUDED.site_url,
           cloud_id = EXCLUDED.cloud_id,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           token_expires_at = EXCLUDED.token_expires_at,
           status = 'active',
           connected_by_user_id = EXCLUDED.connected_by_user_id,
           updated_at = NOW()
         RETURNING *`,
        [
          params.organizationId,
          params.siteUrl,
          params.cloudId,
          params.accessToken,
          params.refreshToken,
          params.tokenExpiresAt,
          params.connectedByUserId,
        ],
      );
      return rows[0];
    });
  }

  async updateTokens(
    organizationId: string,
    params: { accessToken: string; refreshToken: string; tokenExpiresAt: Date },
  ): Promise<void> {
    await withTenant(organizationId, (client) =>
      client.query(
        `UPDATE jira_connections
         SET access_token = $1, refresh_token = $2, token_expires_at = $3, status = 'active', updated_at = NOW()
         WHERE organization_id = $4`,
        [params.accessToken, params.refreshToken, params.tokenExpiresAt, organizationId],
      ),
    );
  }

  async markExpired(organizationId: string): Promise<void> {
    await withTenant(organizationId, (client) =>
      client.query(`UPDATE jira_connections SET status = 'expired', updated_at = NOW() WHERE organization_id = $1`, [
        organizationId,
      ]),
    );
  }

  /** Revokes and scrubs the stored tokens — a revoked connection has nothing left to steal. */
  async revoke(organizationId: string, scrubbedToken: string): Promise<void> {
    await withTenant(organizationId, (client) =>
      client.query(
        `UPDATE jira_connections
         SET status = 'revoked', access_token = $1, refresh_token = $1, updated_at = NOW()
         WHERE organization_id = $2`,
        [scrubbedToken, organizationId],
      ),
    );
  }
}
