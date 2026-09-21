import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminPrismaClient } from '../../prisma/prisma.service';
import { PRISMA_ADMIN } from '../../prisma/prisma.tokens';
import { ApiError } from '../../common/errors';
import { SQLSTATE, constraintOf, sqlStateOf } from '../../common/sqlstate';
import type { AuthActor } from '../../common/types/actor';
import type { SupabaseClaims } from './token-verifier';

/**
 * Uses PRISMA_ADMIN, and this is one of the few places that is correct.
 *
 * Bootstrap runs BEFORE a users row exists, so there is no app.user_id to scope
 * by — the same "no user context exists" situation as a webhook or a job
 * worker. Scoping is instead provided by the caller: we only ever touch the row
 * for the auth_user_id in a token this process has already verified.
 *
 * Nothing else in this module touches PRISMA_ADMIN.
 */
@Injectable()
export class AuthRepository {
  private readonly logger = new Logger(AuthRepository.name);

  constructor(@Inject(PRISMA_ADMIN) private readonly prisma: AdminPrismaClient) {}

  async findActorByAuthUserId(authUserId: string): Promise<AuthActor | null> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId },
      select: { id: true, role: true, kycStatus: true },
    });
    return user;
  }

  /**
   * Find the caller's row, creating it on their first authenticated request.
   *
   * The race is real: a client that fires three requests at once on sign-in
   * gets three concurrent bootstraps, all of which see no row and all of which
   * insert. Serialising with a SELECT-then-INSERT does not fix it under READ
   * COMMITTED — the reads simply happen before any of the writes commit.
   *
   * So we let the unique index on auth_user_id arbitrate and treat losing as a
   * normal outcome: catch 23505, re-read, carry on. One winner, no 500s.
   */
  async findOrBootstrap(claims: SupabaseClaims): Promise<AuthActor> {
    const existing = await this.findActorByAuthUserId(claims.sub);
    if (existing) return existing;

    // Normalise once. A display name that falls back to the phone number and a
    // phone column that disagree about the '+' look like two different people
    // in a support ticket.
    const phone = present(claims.phone) ? normalisePhone(claims.phone!) : null;
    const email = present(claims.email) ? claims.email!.trim() : null;

    try {
      const created = await this.prisma.user.create({
        data: {
          authUserId: claims.sub,
          fullName: displayNameFrom(claims, { phone, email }),
          phone,
          email,
          role: 'RENTER',
          kycStatus: 'NONE',
        },
        select: { id: true, role: true, kycStatus: true },
      });
      return created;
    } catch (error) {
      if (sqlStateOf(error) !== SQLSTATE.UNIQUE_VIOLATION) throw error;

      // Lost the race. Someone else's INSERT committed first, which is a
      // success for the caller too — the row they needed now exists.
      const winner = await this.findActorByAuthUserId(claims.sub);
      if (winner) {
        this.logger.debug(`bootstrap race resolved for ${claims.sub}`);
        return winner;
      }

      // 23505 on something other than auth_user_id — a duplicate phone or
      // email belonging to a DIFFERENT auth user. Never silently merge those:
      // two Supabase identities sharing one phone is either a migration
      // artefact or an account-takeover attempt, and both need a human.
      //
      // Deliberately not a 401. The token verified; we refused to serve it, and
      // saying "authenticate again" would send the client round a refresh loop
      // over a problem no amount of re-authenticating can fix.
      this.logger.error(
        { authUserId: claims.sub, constraint: constraintOf(error) },
        'refused to merge two auth identities onto one contact detail',
      );
      throw ApiError.conflict(
        'IDEMPOTENCY_CONFLICT',
        'Those contact details already belong to another account',
      );
    }
  }
}

/**
 * Supabase OMITS nothing: a phone-OTP token carries `email: ""` and an email
 * token carries `phone: ""`. Both columns are UNIQUE, so storing the empty
 * string means the SECOND phone-only signup collides with the first on "" —
 * bootstrap throws, and every user after the first gets a 500 on sign-in.
 *
 * Found by verifying a token a real Supabase issued, not by reading the docs.
 * `users-bootstrap.e2e-spec.ts` keeps it found.
 */
const present = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

/** Supabase puts whatever the provider gave us in user_metadata. Fall back
 *  through the identifiers rather than storing an empty name. */
function displayNameFrom(
  claims: SupabaseClaims,
  contact: { phone: string | null; email: string | null },
): string {
  const metadata = claims['user_metadata'];
  if (metadata && typeof metadata === 'object') {
    const name = (metadata as Record<string, unknown>)['full_name'] ?? (metadata as Record<string, unknown>)['name'];
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return contact.email?.split('@')[0] ?? contact.phone ?? 'New user';
}

/** Supabase stores phone numbers without a '+'. Store one shape, so a lookup
 *  by phone cannot miss a row that is really there. */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `+${digits}`;
}
