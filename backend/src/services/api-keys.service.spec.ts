import { createHash } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysDao, ApiKeyRow } from '../dao/api-keys.dao';

const ORG_ID = 'org-1';

describe('ApiKeysService', () => {
  let apiKeysDao: jest.Mocked<ApiKeysDao>;
  let service: ApiKeysService;

  beforeEach(() => {
    apiKeysDao = { findAllForOrg: jest.fn(), create: jest.fn(), revoke: jest.fn() } as never;
    service = new ApiKeysService(apiKeysDao);
  });

  describe('create', () => {
    it('stores only the SHA-256 hash, and returns the plaintext key exactly once', async () => {
      apiKeysDao.create.mockImplementation(async (params) => ({
        id: 'key-1',
        organization_id: ORG_ID,
        key_hash: params.keyHash,
        label: params.label,
        created_by_user_id: params.createdByUserId,
        is_active: true,
        created_at: new Date(),
      }));

      const result = await service.create(ORG_ID, 'user-1', 'CI pipeline');

      const [[createArgs]] = apiKeysDao.create.mock.calls;
      expect(createArgs.keyHash).toBe(createHash('sha256').update(result.key).digest('hex'));
      expect(result.key).toMatch(/^ihk_/);
    });
  });

  describe('list', () => {
    it('never exposes key_hash to the caller', async () => {
      apiKeysDao.findAllForOrg.mockResolvedValue([
        { id: 'key-1', organization_id: ORG_ID, key_hash: 'secret-hash', label: 'CI', created_by_user_id: 'u1', is_active: true, created_at: new Date() } as ApiKeyRow,
      ]);

      const result = await service.list(ORG_ID);

      expect(result[0]).not.toHaveProperty('key_hash');
    });
  });

  describe('revoke', () => {
    it('throws 404 when the key does not belong to this org (or does not exist)', async () => {
      apiKeysDao.revoke.mockResolvedValue(false);
      await expect(service.revoke('key-1', ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
