import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { ApiKeysDao } from '../dao/api-keys.dao';
import { RequestContext } from '../common/request-context';

/** Auth guard for controllers/api/*. Resolves to RequestContext with only organizationId set. */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeysDao: ApiKeysDao) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { context?: RequestContext }>();
    const key = request.headers['x-api-key'];
    if (!key || typeof key !== 'string') {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyHash = createHash('sha256').update(key).digest('hex');
    const row = await this.apiKeysDao.findActiveByHash(keyHash);
    if (!row) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    request.context = { organizationId: row.organization_id };
    return true;
  }
}
