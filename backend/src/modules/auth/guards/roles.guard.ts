import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../../common/errors';
import type { AuthActor } from '../../../common/types/actor';
import { ACTOR_KEY, type RequestWithActor } from '../decorators/current-user.decorator';
import { ROLES } from '../decorators/roles.decorator';

/** Also global. A route with no @Roles() has no role requirement; a route with
 *  one is checked against the actor JwtAuthGuard already resolved. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<AuthActor['role'][]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const actor = context.switchToHttp().getRequest<RequestWithActor>()[ACTOR_KEY];
    if (!actor) {
      throw new ApiError('UNAUTHENTICATED', 401, 'Authentication required');
    }

    // ADMIN is not implicitly every role. An admin who needs to act as an owner
    // does so through an admin route that says so, which leaves an audit trail.
    if (!required.includes(actor.role)) {
      throw ApiError.forbidden(`This action requires the ${required.join(' or ')} role`);
    }
    return true;
  }
}
