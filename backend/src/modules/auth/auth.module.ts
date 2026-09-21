import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { KycGuard } from './guards/kyc.guard';
import { OtpThrottleGuard } from './guards/otp-throttle.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp.service';
import { TokenVerifier } from './token-verifier';

/**
 * Guards are registered GLOBALLY, in this order: authenticate, then role, then
 * KYC. Nest runs APP_GUARD providers in declaration order, which matters —
 * RolesGuard reads the actor JwtAuthGuard attached, so the reverse order would
 * make every role check see an empty request.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenVerifier,
    OtpService,
    OtpThrottleGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: KycGuard },
  ],
  exports: [AuthService, TokenVerifier],
})
export class AuthModule {}
