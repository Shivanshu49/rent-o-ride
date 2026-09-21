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
import { SQLSTATE, constraintOf, sqlStateOf } from '../sqlstate';

/**
 * The ONLY exception filter. Everything the API returns is shaped here.
 *
 * It used to be two — a Prisma-specific filter that rethrew what it did not
 * recognise, plus this one. That does not work: a rethrow from inside a filter
 * does not fall through to the next filter, it goes to Nest's built-in handler.
 * So every non-database error was quietly served in Nest's default envelope
 * instead of ours, with no `code` field and no request id. One filter, one
 * path, no ordering to get wrong.
 *
 * It also makes sure a 500 never leaks a stack trace or a connection string to
 * the client — that detail goes to the log, keyed by the request id.
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

  private fromSqlState(exception: unknown): { status: number; body: ApiErrorBody } | null {
    const state = sqlStateOf(exception);
    if (!state) return null;

    const constraint = constraintOf(exception);

    switch (state) {
      case SQLSTATE.EXCLUSION_VIOLATION:
        this.logger.warn({ constraint }, 'exclusion constraint refused an overlap');
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: 'SLOT_TAKEN',
            message: 'That vehicle was just booked for an overlapping period',
          },
        };
      case SQLSTATE.UNIQUE_VIOLATION:
        return {
          status: HttpStatus.CONFLICT,
          body: { code: 'IDEMPOTENCY_CONFLICT', message: 'That record already exists' },
        };
      case SQLSTATE.CHECK_VIOLATION:
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          body: { code: 'VALIDATION_FAILED', message: 'A value was rejected by the database' },
        };
      // 42501 means RLS refused the row. A guard should have caught this first,
      // so it is both a 403 for the caller AND an alert-worthy sign that a
      // repository method forgot its actor scoping.
      case SQLSTATE.INSUFFICIENT_PRIVILEGE:
        this.logger.error({ constraint }, 'RLS refused a write — a repository is missing its scope');
        return {
          status: HttpStatus.FORBIDDEN,
          body: { code: 'FORBIDDEN', message: 'You do not have access to this resource' },
        };
      default:
        return null;
    }
  }

  private describe(exception: unknown): { status: number; body: ApiErrorBody } {
    // Database constraints first: a 23P01 arrives wrapped in a Prisma error
    // that is also an ordinary Error, so checking it later would never match.
    const fromConstraint = this.fromSqlState(exception);
    if (fromConstraint) return fromConstraint;

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

/**
 * Maps Postgres constraint violations to HTTP.
 *
 * 23P01 is the headline one: the bookings exclusion constraint refused an
 * overlapping slot. That is not a server error, it is a race two users lost
 * fairly, and the right answer is 409 SLOT_TAKEN. Phase 6 enriches the body
 * with the next free slot; this guarantees the status code before that exists.
 */
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
