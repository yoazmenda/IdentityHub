import { Injectable } from '@nestjs/common';
import { getPool, withTenant } from '../config/database';

export type AutomationType = 'blog_digest';
export type AutomationSchedule = 'manual' | 'hourly' | 'daily' | 'weekly';

export interface BlogDigestConfig {
  project_key?: string;
  issue_type_id?: string;
}

export interface AutomationRow {
  id: string;
  organization_id: string;
  type: AutomationType;
  enabled: boolean;
  schedule: AutomationSchedule;
  config: BlogDigestConfig;
  last_processed_url: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AutomationsDao {
  async findAllForOrg(organizationId: string): Promise<AutomationRow[]> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<AutomationRow>(
        'SELECT * FROM automations WHERE organization_id = $1 ORDER BY created_at ASC',
        [organizationId],
      );
      return rows;
    });
  }

  async findById(id: string, organizationId: string): Promise<AutomationRow | null> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<AutomationRow>(
        'SELECT * FROM automations WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      );
      return rows[0] ?? null;
    });
  }

  /** Auto-provisions a disabled row the first time an org's automations are listed — no separate "create" step in the UI. */
  async getOrCreate(organizationId: string, type: AutomationType): Promise<AutomationRow> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<AutomationRow>(
        `INSERT INTO automations (organization_id, type) VALUES ($1, $2)
         ON CONFLICT (organization_id, type) DO UPDATE SET type = EXCLUDED.type
         RETURNING *`,
        [organizationId, type],
      );
      return rows[0];
    });
  }

  async update(
    id: string,
    organizationId: string,
    params: Partial<{ enabled: boolean; schedule: AutomationSchedule; config: BlogDigestConfig }>,
  ): Promise<AutomationRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      fields.push(`${key} = $${i}`);
      values.push(key === 'config' ? JSON.stringify(value) : value);
      i++;
    }
    if (fields.length === 0) return this.findById(id, organizationId);
    fields.push('updated_at = NOW()');
    values.push(id, organizationId);

    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<AutomationRow>(
        `UPDATE automations SET ${fields.join(', ')} WHERE id = $${i} AND organization_id = $${i + 1} RETURNING *`,
        values,
      );
      return rows[0] ?? null;
    });
  }

  async setLastProcessedUrl(id: string, organizationId: string, url: string): Promise<void> {
    await withTenant(organizationId, (client) =>
      client.query('UPDATE automations SET last_processed_url = $1, updated_at = NOW() WHERE id = $2', [url, id]),
    );
  }

  /** Every org's enabled automations of a given type — the scheduler tick is the one legitimately
   * cross-tenant background job in this codebase, so it runs on the admin connection. */
  async findAllEnabledByType(type: AutomationType): Promise<AutomationRow[]> {
    const { rows } = await getPool().query<AutomationRow>(
      "SELECT * FROM automations WHERE type = $1 AND enabled = TRUE AND schedule != 'manual'",
      [type],
    );
    return rows;
  }
}
