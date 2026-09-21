import { Inject, Injectable } from '@nestjs/common';
import type { DocType, KycStatus } from '@prisma/client';
import type { ScopedPrismaClient } from '../../prisma/prisma.service';
import { PRISMA_SCOPED } from '../../prisma/prisma.tokens';
import type { AuthActor } from '../../common/types/actor';

export interface KycDocumentRow {
  id: string;
  userId: string;
  docType: DocType;
  storagePath: string;
  status: KycStatus;
  createdAt: Date;
}

/**
 * Reads only, every one of them scoped through runScoped so the RLS policies on
 * kyc_documents evaluate. There is no unscoped read of this table.
 *
 * Creating a document moved to PrivilegedWritesService.openKycDocument: the row
 * carries a `status`, app_role no longer holds INSERT on that column, and the
 * same act has to move the user to PENDING and leave an audit entry.
 */
@Injectable()
export class KycRepository {
  constructor(@Inject(PRISMA_SCOPED) private readonly prisma: ScopedPrismaClient) {}

  /**
   * Returns null both when the document does not exist AND when the caller may
   * not see it. Deliberately indistinguishable: a 404 that differs from a 403
   * tells a prober which document ids are real.
   */
  async findForActor(actor: AuthActor, id: string): Promise<KycDocumentRow | null> {
    return this.prisma.runScoped(actor, (tx) =>
      tx.kycDocument.findFirst({
        where: { id },
        select: { id: true, userId: true, docType: true, storagePath: true, status: true, createdAt: true },
      }),
    );
  }

  async listForActor(actor: AuthActor): Promise<KycDocumentRow[]> {
    return this.prisma.runScoped(actor, (tx) =>
      tx.kycDocument.findMany({
        where: { userId: actor.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, userId: true, docType: true, storagePath: true, status: true, createdAt: true },
      }),
    );
  }
}
