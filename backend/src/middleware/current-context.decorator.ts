import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../common/request-context';

/** Pulls the RequestContext a guard attached to the request. Used in controller method signatures. */
export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Request & { context: RequestContext }>();
    return request.context;
  },
);
