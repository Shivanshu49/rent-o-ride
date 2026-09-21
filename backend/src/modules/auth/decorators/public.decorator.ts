import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

/**
 * Opts a route out of JwtAuthGuard.
 *
 * The guard is registered GLOBALLY, so this decorator is the only way a route
 * becomes reachable without a token. That direction matters: forgetting to
 * protect a route leaves it protected, and exposing one is a visible, greppable
 * act rather than an omission nobody notices in review.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
