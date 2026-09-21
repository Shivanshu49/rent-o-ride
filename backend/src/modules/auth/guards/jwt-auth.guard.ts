import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../../common/errors';
import { ACTOR_KEY, type RequestWithActor } from '../decorators/current-user.decorator';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { AuthService } from '../auth.service';
import { TokenVerificationError } from '../token-verifier';

/**
 * Registered GLOBALLY in AuthModule via APP_GUARD.
 *
 * That is the entire design decision. Per-route guards fail OPEN: a new
 * controller ships without @UseGuards and is silently world-readable, and
 * nothing in review or CI notices. Registered globally the default inverts —
 * every route is closed, and opening one requires writing @Public(), which is a
 * deliberate, greppable act.
 *
 * `auth-guards.e2e-spec.ts` mounts a controller with no decorator
 * at all and asserts 401, so the property is tested rather than the wiring.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const token = bearerTokenFrom(request.headers.authorization);

    if (isPublic) {
      // A public route still resolves a token when one is offered, so search
      // can personalise without a second round trip. A bad token on a public
      // route is ignored, not fatal — it must not break browsing.
      if (token) {
        try {
          request[ACTOR_KEY] = await this.auth.resolveActor(token);
        } catch (error) {
          // Degrading to anonymous is right; doing it silently is not. If this
          // is a database failure rather than a bad token, the only evidence
          // is this line.
          this.logger.debug(
            { requestId: request.id, reason: (error as Error).message },
            'public route continuing anonymously',
          );
        }
      }
      return true;
    }

    if (!token) {
      throw new ApiError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Authentication required');
    }

    try {
      request[ACTOR_KEY] = await this.auth.resolveActor(token);
      return true;
    } catch (error) {
      // ONLY a verification failure is a 401. resolveActor also hits the
      // database, and answering 401 for a database problem is actively harmful:
      // the token was fine, so the client refreshes it, fails again, and signs
      // the user out — burying a server-side fault under a sign-in loop that
      // looks like the user's fault. Anything else goes to the exception
      // filter, which has a status for it.
      if (!(error instanceof TokenVerificationError)) throw error;

      // The specific reason — expired, bad signature, wrong issuer — is a hint
      // to anyone probing, so it goes to the log and not to the response.
      this.logger.warn(
        { requestId: request.id, reason: error.message },
        'token rejected',
      );
      throw new ApiError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Authentication required');
    }
  }
}

function bearerTokenFrom(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
