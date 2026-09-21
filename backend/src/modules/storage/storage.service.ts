import { Injectable, Logger } from '@nestjs/common';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { ApiError } from '../../common/errors';
import { AppConfig } from '../../config/config.module';

export const BUCKETS = {
  /** KYC documents. Private, forever. */
  kyc: 'kyc',
  /** Handover and damage photos. Private — they are evidence in a dispute. */
  tripPhotos: 'trip-photos',
  /** Listing photos. The only public bucket. */
  vehicleImages: 'vehicle-images',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
}

/**
 * The only file that holds the Supabase service-role key.
 *
 * Signed URLs are minted here, server-side, after the caller has been
 * authenticated and authorised. The browser uploads straight to storage with a
 * one-shot token, so a large file never passes through the API — but it also
 * never gets a key that could read anyone else's document.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;

  constructor(private readonly config: AppConfig) {
    this.client = createClient(
      this.config.get('SUPABASE_URL'),
      this.config.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  /** A one-shot URL the client PUTs to. Scoped to exactly this path. */
  async createSignedUpload(bucket: BucketName, path: string): Promise<SignedUpload> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) {
      this.logger.error({ bucket, err: error }, 'failed to mint upload URL');
      throw new ApiError('UPSTREAM_UNAVAILABLE', 502, 'Could not start the upload');
    }
    return { path: data.path, signedUrl: data.signedUrl, token: data.token };
  }

  /**
   * A time-limited read URL.
   *
   * `expiresInSeconds` is short and is not caller-controlled. A signed URL that
   * does not expire is a public URL with extra steps — it gets pasted into a
   * chat, logged by a proxy, or kept in a browser history, and it keeps working.
   */
  async createSignedRead(bucket: BucketName, path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      this.logger.error({ bucket, err: error }, 'failed to mint read URL');
      throw ApiError.notFound('Document');
    }
    return data.signedUrl;
  }

  async remove(bucket: BucketName, paths: readonly string[]): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([...paths]);
    if (error) this.logger.warn({ bucket, err: error }, 'failed to remove objects');
  }
}
