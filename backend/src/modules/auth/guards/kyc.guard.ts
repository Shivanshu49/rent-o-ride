import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../../common/errors';
import { ACTOR_KEY, type RequestWithActor } from '../decorators/current-user.decorator';
import { REQUIRES_KYC } from '../decorators/kyc.decorator';

/**
 * Gates the routes where we hand over a physical asset.
 *
 * Distinct from RolesGuard on purpose: a verified owner with unverified KYC is
 * a different situation from a renter on an owner-only route, and conflating
 * them produces a 403 that tells the user nothing about what to do next. This
 * one returns KYC_REQUIRED, which the web client turns into the upload flow.
 */
@Injectable()
export class KycGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<boolean>(REQUIRES_KYC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const actor = context.switchToHttp().getRequest<RequestWithActor>()[ACTOR_KEY];
    if (!actor) throw new ApiError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Authentication required');

    if (actor.kycStatus !== 'VERIFIED') {
      throw new ApiError(
        'KYC_REQUIRED',
        HttpStatus.FORBIDDEN,
        'Verify your identity before continuing',
        { kycStatus: actor.kycStatus },
      );
    }
    return true;
  }
}
