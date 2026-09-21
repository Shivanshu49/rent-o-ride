import { Injectable } from '@nestjs/common';
import type { AuthActor } from '../../common/types/actor';
import { AuthRepository } from './auth.repository';
import { TokenVerifier, type SupabaseClaims } from './token-verifier';

@Injectable()
export class AuthService {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly repo: AuthRepository,
  ) {}

  /** Verify the token, then resolve it to one of our users. */
  async resolveActor(token: string): Promise<AuthActor> {
    const claims: SupabaseClaims = await this.verifier.verify(token);
    return this.repo.findOrBootstrap(claims);
  }
}
