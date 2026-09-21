import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DocType, KycStatus } from '@prisma/client';
import type { AdminPrismaClient } from '../../prisma/prisma.service';
import { PRISMA_ADMIN } from '../../prisma/prisma.tokens';
import type { AuthActor } from '../../common/types/actor';

/**
 * The only place a privileged column is written.
 *
 * `20260921120000_privileged_columns` revoked app_role's UPDATE and INSERT on
 * the columns that grant privilege, hold money, or drive a state machine —
 * `users.role`, `users.kyc_status`, `owner_profiles.is_verified`,
 * `owner_profiles.commission_bps`, `vehicles.status`, `kyc_documents.status`.
 * Postgres now refuses those writes with 42501 for every client connected as
 * app_role, which is every request-path client in the process.
 *
 * The legitimate transitions still have to happen. They happen HERE, and the
 * shape is deliberate and uniform:
 *
 *   - one named method per transition, so "what can change is_verified?" is
 *     answered by reading this file rather than by grepping the repo
 *   - PRISMA_ADMIN, which is the table owner and therefore not subject to the
 *     grant — this is the explicit, reviewed escape hatch, not an accident
 *   - an audit_log row written in the SAME transaction as the change, so the
 *     evidence cannot be lost to a partial failure. app_role lost INSERT on
 *     audit_log in the same migration: a log its subjects can write is not a log
 *   - the caller's own authorization is checked BEFORE we get here, by the
 *     guards. This service does not decide who may act, only how the act is
 *     recorded
 *
 * Adding a method here is a security decision. Say why, in the diff.
 */
@Injectable()
export class PrivilegedWritesService {
  private readonly logger = new Logger(PrivilegedWritesService.name);

  constructor(@Inject(PRISMA_ADMIN) private readonly prisma: AdminPrismaClient) {}

  /**
   * Owner application.
   *
   * `is_verified` and `commission_bps` are NOT passed. They are left to the
   * column defaults (false / 1800) precisely because this code cannot be
   * trusted to be the only caller forever — the database now holds the honest
   * values, and app_role could not override them even from a crafted query.
   *
   * Idempotent: a double-tapped button returns the existing profile rather than
   * erroring, and does not write a second audit row.
   */
  async applyForOwnerProfile(
    actor: AuthActor,
    payoutAccountRef?: string,
  ): Promise<OwnerProfile> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ownerProfile.findUnique({
        where: { userId: actor.id },
        select: OWNER_PROFILE_FIELDS,
      });
      if (existing) return existing;

      const created = await tx.ownerProfile.create({
        data: { userId: actor.id, ...(payoutAccountRef ? { payoutAccountRef } : {}) },
        select: OWNER_PROFILE_FIELDS,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'owner.apply',
          entity: 'owner_profiles',
          entityId: actor.id,
          after: { isVerified: created.isVerified, commissionBps: created.commissionBps },
        },
      });

      return created;
    });
  }

  /**
   * A KYC document is opened, and the user moves to PENDING review.
   *
   * Two privileged writes in one transaction. `kyc_documents.status` is not
   * passed — the column default PENDING is the only reachable value, so the row
   * cannot assert its own verdict. That was a live escalation before this
   * migration: `kyc_documents_self_insert` checked only who owned the row, so a
   * crafted insert with `status = 'VERIFIED'` self-verified, and the file
   * nobody looked at became proof of identity.
   *
   * The user's own `kyc_status` moves NONE|REJECTED -> PENDING. Never from
   * VERIFIED: uploading another document must not un-verify somebody, and
   * never TO VERIFIED, which is an admin's decision in Phase 11.
   */
  async openKycDocument(
    actor: AuthActor,
    input: { docType: DocType; storagePath: string },
  ): Promise<{ documentId: string; kycStatus: KycStatus }> {
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.kycDocument.create({
        data: { userId: actor.id, docType: input.docType, storagePath: input.storagePath },
        select: { id: true, status: true },
      });

      const moved = await tx.user.updateMany({
        where: { id: actor.id, kycStatus: { in: ['NONE', 'REJECTED'] } },
        data: { kycStatus: 'PENDING' },
      });

      const { kycStatus } = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { kycStatus: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'kyc.document.opened',
          entity: 'kyc_documents',
          entityId: document.id,
          // The PATH, never the bytes and never a number off the document.
          after: { docType: input.docType, status: document.status, kycStatus },
        },
      });

      if (moved.count > 0) {
        this.logger.log({ userId: actor.id }, 'kyc_status moved to PENDING');
      }
      return { documentId: document.id, kycStatus };
    });
  }
}

const OWNER_PROFILE_FIELDS = {
  userId: true,
  commissionBps: true,
  isVerified: true,
  reliability: true,
} as const;

export interface OwnerProfile {
  userId: string;
  commissionBps: number;
  isVerified: boolean;
  reliability: number;
}
