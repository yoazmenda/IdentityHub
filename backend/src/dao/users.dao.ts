import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { getPool } from '../config/database';

export interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
}

@Injectable()
export class UsersDao {
  private readonly pool: Pool = getPool();

  /** Not org-scoped: lookup by email happens before we know the org (login/register). */
  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [
      email,
    ]);
    return rows[0] ?? null;
  }

  async findById(id: string, organizationId: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT * FROM users WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    return rows[0] ?? null;
  }

  async create(params: {
    organizationId: string;
    email: string;
    passwordHash: string;
    name: string;
  }): Promise<UserRow> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (organization_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [params.organizationId, params.email, params.passwordHash, params.name],
    );
    return rows[0];
  }
}
