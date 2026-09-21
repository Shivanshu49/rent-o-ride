import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { KycStatus } from '@prisma/client';
import type { DocType, KycUploadRequestInput } from '@ror/shared';
import { ApiError } from '../../common/errors';
import type { AuthActor } from '../../common/types/actor';
import { AppConfig } from '../../config/config.module';
import { BUCKETS, StorageService } from '../storage/storage.service';
import { PrivilegedWritesService } from '../privileged/privileged-writes.service';
import { KycRepository } from './kyc.repository';

const EXTENSION: Record<KycUploadRequestInput['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

@Injectable()
export class KycService {
  constructor(
    private readonly repo: KycRepository,
    private readonly privileged: PrivilegedWritesService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Mint a one-shot upload URL and record our side of it.
   *
   * The path is server-chosen and namespaced by user id. If the client picked
   * the path it could write into another user's folder, and the bucket's own
   * policies are the only thing that would stop it.
   */
  async requestUpload(
    actor: AuthActor,
    input: KycUploadRequestInput,
  ): Promise<{ documentId: string; uploadUrl: string; token: string; path: string; kycStatus: KycStatus }> {
    const path = `${actor.id}/${input.docType.toLowerCase()}-${randomUUID()}.${EXTENSION[input.contentType]}`;
    const upload = await this.storage.createSignedUpload(BUCKETS.kyc, path);

    // Privileged: the row carries a status, and opening it also moves the user
    // to PENDING. Both are columns app_role cannot write, which is the point —
    // a document that could assert its own `status = 'VERIFIED'` made the photo
    // nobody looked at into proof of identity.
    const opened = await this.privileged.openKycDocument(actor, {
      docType: input.docType as DocType,
      storagePath: path,
    });

    return {
      documentId: opened.documentId,
      uploadUrl: upload.signedUrl,
      token: upload.token,
      path,
      // Returned so the client can show "under review" without a second call.
      kycStatus: opened.kycStatus,
    };
  }

  /**
   * A short-lived read URL, after an ownership check.
   *
   * TTL comes from config and is never caller-supplied — a URL that does not
   * expire is a public URL, and this one points at someone's licence.
   */
  async readUrl(actor: AuthActor, documentId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const document = await this.repo.findForActor(actor, documentId);
    if (!document) throw ApiError.notFound('Document');

    // Belt and braces. RLS already filtered this, but the check is one line and
    // it means a future change to the policy cannot silently widen access here.
    if (document.userId !== actor.id && actor.role !== 'ADMIN') {
      throw ApiError.notFound('Document');
    }

    const expiresInSeconds = this.config.get('KYC_SIGNED_URL_TTL_SECONDS');
    const url = await this.storage.createSignedRead(BUCKETS.kyc, document.storagePath, expiresInSeconds);
    return { url, expiresInSeconds };
  }

  async listMine(actor: AuthActor): Promise<{ id: string; docType: DocType; status: string; createdAt: Date }[]> {
    const rows = await this.repo.listForActor(actor);
    // storage_path never leaves the server: it is the one piece of this row
    // that is useful to someone who should not have it.
    return rows.map((r) => ({ id: r.id, docType: r.docType, status: r.status, createdAt: r.createdAt }));
  }
}
