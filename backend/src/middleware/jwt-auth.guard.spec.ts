import * as jwt from 'jsonwebtoken';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionsDao } from '../dao/sessions.dao';

jest.mock('../config/env', () => ({ env: { jwtSecret: 'test-secret-value-not-real' } }));

function makeContext(headers: Record<string, string>): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  let sessionsDao: jest.Mocked<SessionsDao>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    sessionsDao = { findActiveById: jest.fn() } as never;
    guard = new JwtAuthGuard(sessionsDao);
  });

  it('rejects a request with no Authorization header', async () => {
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed (non-Bearer) Authorization header', async () => {
    const { context } = makeContext({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const badToken = jwt.sign({ sub: 'u1', org: 'o1' }, 'wrong-secret', { jwtid: 's1' });
    const { context } = makeContext({ authorization: `Bearer ${badToken}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid JWT whose session has been logged out (deleted)', async () => {
    const token = jwt.sign({ sub: 'u1', org: 'o1' }, 'test-secret-value-not-real', { jwtid: 's1' });
    sessionsDao.findActiveById.mockResolvedValue(null);
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the session belongs to a different user/org than the JWT claims (tampered token)', async () => {
    const token = jwt.sign({ sub: 'u1', org: 'o1' }, 'test-secret-value-not-real', { jwtid: 's1' });
    sessionsDao.findActiveById.mockResolvedValue({
      id: 's1',
      user_id: 'someone-else',
      organization_id: 'o1',
      expires_at: new Date(Date.now() + 100000),
      created_at: new Date(),
    });
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid token with a live matching session, and attaches context + sessionId', async () => {
    const token = jwt.sign({ sub: 'u1', org: 'o1' }, 'test-secret-value-not-real', { jwtid: 's1' });
    sessionsDao.findActiveById.mockResolvedValue({
      id: 's1',
      user_id: 'u1',
      organization_id: 'o1',
      expires_at: new Date(Date.now() + 100000),
      created_at: new Date(),
    });
    const { context, request } = makeContext({ authorization: `Bearer ${token}` });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.context).toEqual({ userId: 'u1', organizationId: 'o1' });
    expect(request.sessionId).toBe('s1');
  });
});
