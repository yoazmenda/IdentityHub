import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestWithSession } from './jwt-auth.guard';

/** Only meaningful behind JwtAuthGuard. Used solely by the logout endpoint. */
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & RequestWithSession>();
    return request.sessionId;
  },
);
