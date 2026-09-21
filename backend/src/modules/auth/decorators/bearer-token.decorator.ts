import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * The raw access token off the request.
 *
 * Only sign-out needs it: revoking a session at Supabase means presenting the
 * token being revoked, and @CurrentUser() gives the resolved actor rather than
 * the string. JwtAuthGuard has already verified it by the time this runs, so
 * the value reaching a handler is never an unchecked one.
 */
export const BearerToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const header = ctx.switchToHttp().getRequest<FastifyRequest>().headers.authorization ?? '';
  return header.slice('Bearer '.length).trim();
});
