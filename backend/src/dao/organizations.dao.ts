import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { getPool } from '../config/database';

export interface OrganizationRow {
  id: string;
  name: string;
  created_at: Date;
}

@Injectable()
export class OrganizationsDao {
  private readonly pool: Pool = getPool();

  async findById(id: string): Promise<OrganizationRow | null> {
    const { rows } = await this.pool.query<OrganizationRow>(
      'SELECT * FROM organizations WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(name: string): Promise<OrganizationRow> {
    const { rows } = await this.pool.query<OrganizationRow>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING *',
      [name],
    );
    return rows[0];
  }
}
