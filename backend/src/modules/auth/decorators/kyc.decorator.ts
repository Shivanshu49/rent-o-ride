import { SetMetadata } from '@nestjs/common';

export const REQUIRES_KYC = 'auth:requiresKyc';

/**
 * Marks a route that only a KYC-verified user may call: creating a booking,
 * taking a vehicle at pickup. Anything where we hand over a physical asset.
 */
export const RequiresKyc = (): MethodDecorator & ClassDecorator => SetMetadata(REQUIRES_KYC, true);
