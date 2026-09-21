import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthActor } from '../../common/types/actor';
import { BearerToken } from './decorators/bearer-token.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { OtpThrottleGuard } from './guards/otp-throttle.guard';
import { RefreshSessionDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpService } from './otp.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly otp: OtpService) {}

  @Public()
  @UseGuards(OtpThrottleGuard)
  @Post('otp')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a sign-in code by SMS' })
  @ApiResponse({ status: 429, description: 'Rate limited per phone number. Retry-After is set.' })
  requestOtp(@Body() body: RequestOtpDto) {
    return this.otp.sendOtp(body.phone);
  }

  @Public()
  @Post('otp/verify')
  // Nest answers POST with 201 by default. Nothing is created here — a code is
  // exchanged for a session that Supabase already holds — and a client that
  // switches on the status should not have to special-case a phantom Created.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a code for a session' })
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.otp.verifyOtp(body.phone, body.token);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new session',
    description:
      'Public because an expired access token is exactly when this is called. The refresh token IS the credential. It goes through this API rather than straight to Supabase so the browser never needs the anon key — a browser holding that key can request an OTP directly and the per-phone limit becomes decoration.',
  })
  @ApiResponse({ status: 401, description: 'Expired, already rotated, or revoked by a sign-out.' })
  refresh(@Body() body: RefreshSessionDto) {
    return this.otp.refresh(body.refreshToken);
  }

  @Post('signout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke the session at Supabase',
    description:
      'Not just a client-side forget: without this the refresh token stays valid for its full lifetime, so signing out on a shared machine would mean nothing.',
  })
  async signOut(@BearerToken() token: string): Promise<void> {
    await this.otp.signOut(token);
  }

  /** Resolves the bearer token to our user, creating the row on first call. */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user, as this API sees them' })
  me(@CurrentUser() actor: AuthActor): AuthActor {
    return actor;
  }
}
