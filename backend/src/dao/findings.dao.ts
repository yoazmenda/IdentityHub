import { Injectable } from '@nestjs/common';
import { withTenant } from '../config/database';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'resolved';

export interface FindingRow {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class FindingsDao {
  // Every method takes organizationId, bakes it into the WHERE clause, and runs via
  // withTenant — RLS enforces the same boundary at the DB level (see the migration).

  async findAllForOrg(organizationId: string): Promise<FindingRow[]> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<FindingRow>(
        'SELECT * FROM findings WHERE organization_id = $1 ORDER BY created_at DESC',
        [organizationId],
      );
      return rows;
    });
  }

  async findById(id: string, organizationId: string): Promise<FindingRow | null> {
    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<FindingRow>(
        'SELECT * FROM findings WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      );
      return rows[0] ?? null;
    });
  }

  async create(params: {
    organizationId: string;
    title: string;
    description: string;
    severity: Severity;
  }): Promise<FindingRow> {
    return withTenant(params.organizationId, async (client) => {
      const { rows } = await client.query<FindingRow>(
        `INSERT INTO findings (organization_id, title, description, severity)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [params.organizationId, params.title, params.description, params.severity],
      );
      return rows[0];
    });
  }

  async update(
    id: string,
    organizationId: string,
    params: Partial<{ title: string; description: string; severity: Severity; status: FindingStatus }>,
  ): Promise<FindingRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      fields.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }
    if (fields.length === 0) {
      return this.findById(id, organizationId);
    }
    fields.push(`updated_at = NOW()`);
    values.push(id, organizationId);

    return withTenant(organizationId, async (client) => {
      const { rows } = await client.query<FindingRow>(
        `UPDATE findings SET ${fields.join(', ')}
         WHERE id = $${i} AND organization_id = $${i + 1} RETURNING *`,
        values,
      );
      return rows[0] ?? null;
    });
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    return withTenant(organizationId, async (client) => {
      const result = await client.query(
        'DELETE FROM findings WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }
}
