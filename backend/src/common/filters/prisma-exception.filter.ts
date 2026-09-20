import { ArgumentsHost, Catch, type ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorBody } from '../errors';
import { SQLSTATE, constraintOf, sqlStateOf } from '../sqlstate';

/**
 * Maps Postgres constraint violations to HTTP.
 *
 * 23P01 is the headline one: the bookings exclusion constraint refused an
 * overlapping slot. That is not a server error, it is a race two users lost
 * fairly, and the right answer is 409 SLOT_TAKEN. Phase 6 enriches the response
 * with the next free slot; this filter guarantees the status code even before
 * that exists.
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  /** Returns false when it did not handle the error, so the next filter runs. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const mapped = mapSqlState(exception);
    if (!mapped) throw exception;

    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();

    this.logger.warn(
      { requestId: request.id, constraint: constraintOf(exception), sqlState: sqlStateOf(exception) },
      `constraint violation -> ${mapped.status}`,
    );

    void reply.status(mapped.status).send({ ...mapped.body, requestId: String(request.id ?? '') });
  }
}

function mapSqlState(exception: unknown): { status: number; body: ApiErrorBody } | null {
  switch (sqlStateOf(exception)) {
    case SQLSTATE.EXCLUSION_VIOLATION:
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
        body: { code: 'VALIDATION_FAILED', message: 'A database check constraint rejected the value' },
      };
    // 42501 means RLS refused the row. The guard layer should have caught this
    // first, so treat it as a real authorization failure AND an alert-worthy
    // sign that a repository method forgot its scope.
    case SQLSTATE.INSUFFICIENT_PRIVILEGE:
      return {
        status: HttpStatus.FORBIDDEN,
        body: { code: 'FORBIDDEN', message: 'You do not have access to this resource' },
      };
    default:
      return null;
  }
}
