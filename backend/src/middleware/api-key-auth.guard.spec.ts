import { createHash } from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ApiKeysDao, ApiKeyRow } from '../dao/api-keys.dao';

function makeContext(headers: Record<string, string>): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('ApiKeyAuthGuard', () => {
  let apiKeysDao: jest.Mocked<ApiKeysDao>;
  let guard: ApiKeyAuthGuard;

  beforeEach(() => {
    apiKeysDao = { findActiveByHash: jest.fn() } as never;
    guard = new ApiKeyAuthGuard(apiKeysDao);
  });

  it('rejects a request with no X-API-Key header', async () => {
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a key that hashes to nothing active (unknown or revoked)', async () => {
    apiKeysDao.findActiveByHash.mockResolvedValue(null);
    const { context } = makeContext({ 'x-api-key': 'ihk_bogus' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('hashes the raw key with SHA-256 before looking it up — never queries the plaintext', async () => {
    const plainKey = 'ihk_realkey123';
    const expectedHash = createHash('sha256').update(plainKey).digest('hex');
    apiKeysDao.findActiveByHash.mockResolvedValue({ organization_id: 'org-1' } as ApiKeyRow);
    const { context } = makeContext({ 'x-api-key': plainKey });

    await guard.canActivate(context);

    expect(apiKeysDao.findActiveByHash).toHaveBeenCalledWith(expectedHash);
  });

  it('accepts a valid key and attaches org-only context (no userId — API-key callers are not a user)', async () => {
    apiKeysDao.findActiveByHash.mockResolvedValue({ organization_id: 'org-1' } as ApiKeyRow);
    const { context, request } = makeContext({ 'x-api-key': 'ihk_realkey123' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.context).toEqual({ organizationId: 'org-1' });
  });
});
