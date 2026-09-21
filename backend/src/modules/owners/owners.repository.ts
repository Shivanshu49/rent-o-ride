import { Inject, Injectable } from '@nestjs/common';
import type { ScopedPrismaClient } from '../../prisma/prisma.service';
import { PRISMA_SCOPED } from '../../prisma/prisma.tokens';
import type { AuthActor } from '../../common/types/actor';
import type { OwnerProfile } from '../privileged/privileged-writes.service';

/**
 * Reads only.
 *
 * Creating a profile used to live here and passed `isVerified: false,
 * commissionBps: 1800` from application code. app_role no longer holds INSERT
 * on either column, so that write is now a 42501 — and the values come from the
 * column defaults instead, where an owner cannot reach them. The write moved to
 * PrivilegedWritesService.applyForOwnerProfile, which audits it.
 */
@Injectable()
export class OwnersRepository {
  constructor(@Inject(PRISMA_SCOPED) private readonly prisma: ScopedPrismaClient) {}

  async findProfile(actor: AuthActor, userId: string): Promise<OwnerProfile | null> {
    return this.prisma.runScoped(actor, (tx) =>
      tx.ownerProfile.findUnique({
        where: { userId },
        select: { userId: true, commissionBps: true, isVerified: true, reliability: true },
      }),
    );
  }
}
