import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { ApiKeysDao, ApiKeyRow } from '../dao/api-keys.dao';

export interface CreatedApiKey {
  id: string;
  label: string;
  key: string; // plaintext — only ever returned here, once
  created_at: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly apiKeysDao: ApiKeysDao) {}

  async list(organizationId: string): Promise<Omit<ApiKeyRow, 'key_hash'>[]> {
    const rows = await this.apiKeysDao.findAllForOrg(organizationId);
    return rows.map(({ key_hash: _keyHash, ...rest }) => rest);
  }

  async create(organizationId: string, userId: string, label: string): Promise<CreatedApiKey> {
    const plainKey = `ihk_${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(plainKey).digest('hex');

    const row = await this.apiKeysDao.create({
      organizationId,
      keyHash,
      label,
      createdByUserId: userId,
    });

    return { id: row.id, label: row.label, key: plainKey, created_at: row.created_at };
  }

  async revoke(id: string, organizationId: string): Promise<void> {
    const revoked = await this.apiKeysDao.revoke(id, organizationId);
    if (!revoked) {
      throw new NotFoundException('API key not found');
    }
  }
}
