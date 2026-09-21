import { z } from 'zod';

/**
 * KYC request shapes.
 *
 * Note what is NOT here, and never will be: no licence number, no Aadhaar
 * number, no PAN, no passport number, no field that holds a government ID
 * string at all. We take a photograph of the document, store the path to it,
 * and record a human's verdict.
 *
 * Holding the numbers would buy us nothing — verification is done by looking at
 * the image — while making this database worth stealing and putting us under
 * obligations we have no reason to take on. `no-id-numbers.spec.ts` asserts the
 * absence across the schema, these DTOs and the Prisma models, so the claim is
 * enforced rather than merely intended.
 */

export const docTypeSchema = z.enum(['DRIVING_LICENCE', 'ID_PROOF', 'ADDRESS_PROOF', 'SELFIE']);
export type DocType = z.infer<typeof docTypeSchema>;

export const kycUploadRequestSchema = z.object({
  docType: docTypeSchema,
  /** Used only to pick a file extension for the storage path. */
  contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
});
export type KycUploadRequestInput = z.infer<typeof kycUploadRequestSchema>;

/** Sent once the browser has finished PUTting to the signed URL. */
export const kycUploadCompleteSchema = z.object({
  documentId: z.string().uuid(),
});
export type KycUploadCompleteInput = z.infer<typeof kycUploadCompleteSchema>;

export const kycReviewSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
export type KycReviewInput = z.infer<typeof kycReviewSchema>;
