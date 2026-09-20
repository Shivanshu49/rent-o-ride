import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ApiErrorBody, ApiErrorCode } from '../errors';

/**
 * Last filter in the chain. Turns anything unhandled into the same envelope the
 * rest of the API uses, and makes sure a 500 never leaks a stack trace or a
 * connection string to the client — that detail goes to the log, keyed by the
 * request id so support can find it.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const requestId = String(request.id ?? '');

    const { status, body } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { requestId, method: request.method, url: request.url, err: exception },
        'unhandled exception',
      );
    }

    void reply.status(status).send({ ...body, requestId } satisfies ApiErrorBody);
  }

  private describe(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'VALIDATION_FAILED',
          message: 'Request failed validation',
          details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        return { status, body: payload as ApiErrorBody };
      }

      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: unknown }).message as string | undefined) ?? exception.message;

      return { status, body: { code: statusToCode(status), message: String(message) } };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL', message: 'Something went wrong on our side' },
    };
  }
}

function statusToCode(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_FAILED';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED';
  }
}
