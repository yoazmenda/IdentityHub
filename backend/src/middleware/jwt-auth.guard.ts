import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { SessionsDao } from '../dao/sessions.dao';
import { env } from '../config/env';
import { RequestContext } from '../common/request-context';

interface AccessTokenPayload {
  sub: string; // userId
  org: string; // organizationId
  jti: string; // sessionId
}

/** sessionId lives outside RequestContext since ApiKeyAuthGuard has no equivalent — only logout needs it. */
export interface RequestWithSession {
  context?: RequestContext;
  sessionId?: string;
}

/** Auth guard for controllers/web/*. Resolves to RequestContext with both userId and organizationId set. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessionsDao: SessionsDao) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & RequestWithSession>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length);

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The JWT alone isn't enough — its session must still exist server-side (which is what
    // makes logout actually revoke access) and belong to the org it claims — the second check
    // is enforced twice over, here and independently by RLS inside findActiveById.
    const session = await this.sessionsDao.findActiveById(payload.jti, payload.org);
    if (!session || session.user_id !== payload.sub) {
      throw new UnauthorizedException('Session has been invalidated');
    }

    request.context = { userId: payload.sub, organizationId: payload.org };
    request.sessionId = payload.jti;
    return true;
  }
}
