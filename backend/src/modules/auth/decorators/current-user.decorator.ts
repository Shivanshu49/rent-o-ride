import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthActor } from '../../../common/types/actor';

export const ACTOR_KEY = 'authActor';

export type RequestWithActor = FastifyRequest & { [ACTOR_KEY]?: AuthActor };

/**
 * The caller, as resolved by JwtAuthGuard.
 *
 * Non-optional by design: on a @Public() route there may be no actor, and a
 * handler that wants one there has to say so with @CurrentUser({ optional: true }).
 * Otherwise the type would lie about a value that can be undefined.
 */
export const CurrentUser = createParamDecorator(
  (options: { optional?: boolean } | undefined, ctx: ExecutionContext): AuthActor | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithActor>();
    const actor = request[ACTOR_KEY];
    if (!actor && !options?.optional) {
      throw new Error('@CurrentUser() on a route with no authenticated actor — is it @Public()?');
    }
    return actor;
  },
);
