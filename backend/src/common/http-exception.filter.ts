import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Every error response leaves this process as {"error": string} or the validation-details
// shape — never a raw stack trace or driver error. See README -> REST API -> Input Validation.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Only ValidationFailedException builds a body with `details` — pass it through as-is.
      // Everything else (including Nest's built-ins, whose `error` field is the HTTP status
      // text, not the message) gets normalized to {error: <the actual message>}.
      if (typeof body === 'object' && body !== null && 'details' in body) {
        response.status(status).json(body);
        return;
      }

      response.status(status).json({ error: exception.message });
      return;
    }

    // Unexpected error: log full detail server-side, leak nothing to the client.
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
  }
}
