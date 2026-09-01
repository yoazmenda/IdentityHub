import { Injectable } from '@nestjs/common';
import { getPool, withTenant } from '../config/database';

export interface ApiKeyRow {
  id: string;
  organization_id: string;
  key_hash: string;
  label: string;
  created_by_user_id: string;
  is_active: boolean;
  created_at: Date;
}

@Injectable()
export class ApiKeysDao {
  async findAllForOrg(organizationId: string): Promise<ApiKeyRow[]> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<ApiKeyRow>(
        'SELECT * FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC',
        [organizationId],
      );
      return rows;
    });
  }

  /** Not org-scoped by design: the API-key guard doesn't know the org until it resolves the
   * hash, so this runs on the admin connection rather than a tenant-scoped one. */
  async findActiveByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const { rows } = await getPool().query<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = TRUE',
      [keyHash],
    );
    return rows[0] ?? null;
  }

  async create(params: {
    organizationId: string;
    keyHash: string;
    label: string;
    createdByUserId: string;
  }): Promise<ApiKeyRow> {
    return withTenant(params.organizationId, async (client) => {
      const { rows } = await client.query<ApiKeyRow>(
        `INSERT INTO api_keys (organization_id, key_hash, label, created_by_user_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [params.organizationId, params.keyHash, params.label, params.createdByUserId],
      );
      return rows[0];
    });
  }

  async revoke(id: string, organizationId: string): Promise<boolean> {
    return withTenant(organizationId, async (client) => {
      const result = await client.query(
        'UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }
}
