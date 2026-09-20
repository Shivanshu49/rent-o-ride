import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every error the API returns carries a stable machine-readable code.
 * The web client switches on the code, never on the message — messages are for
 * humans and change freely.
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'KYC_REQUIRED'
  | 'NOT_FOUND'
  | 'SLOT_TAKEN'
  | 'PRICE_CHANGED'
  | 'QUOTE_EXPIRED'
  | 'QUOTE_INVALID'
  | 'INVALID_TRANSITION'
  | 'PUBLISH_REQUIREMENTS_UNMET'
  | 'RATE_CARD_INVALID'
  | 'BOOKING_DISABLED'
  | 'RISK_BLOCKED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    status: HttpStatus,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(what: string): ApiError {
    return new ApiError('NOT_FOUND', HttpStatus.NOT_FOUND, `${what} not found`);
  }

  static forbidden(message = 'You do not have access to this resource'): ApiError {
    return new ApiError('FORBIDDEN', HttpStatus.FORBIDDEN, message);
  }

  static unprocessable(code: ApiErrorCode, message: string, details?: unknown): ApiError {
    return new ApiError(code, HttpStatus.UNPROCESSABLE_ENTITY, message, details);
  }

  static conflict(code: ApiErrorCode, message: string, details?: unknown): ApiError {
    return new ApiError(code, HttpStatus.CONFLICT, message, details);
  }
}
