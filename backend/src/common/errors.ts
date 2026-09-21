import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every error the API returns carries a stable machine-readable code.
 *
 * The union itself lives in @ror/shared so the web client cannot handle a code
 * the server has stopped sending, or miss one it has started sending.
 */
export type { ApiErrorCode, ApiErrorBody } from '@ror/shared';
import type { ApiErrorCode } from '@ror/shared';


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
