import { z } from 'zod';

/**
 * Schemas shared by the API's DTOs and the web app's forms, so client and
 * server validation cannot drift.
 */

/** E.164-ish. Supabase stores digits without a '+'; we normalise to one shape. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number with country code');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  token: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code from the SMS'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/** Opaque to us; Supabase mints and rotates it. Bounded so a junk body cannot
 *  become an unbounded string we hand to an upstream call. */
export const refreshSessionSchema = z.object({
  refreshToken: z.string().trim().min(8).max(512),
});
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;

export const userRoleSchema = z.enum(['RENTER', 'OWNER', 'ADMIN']);
export const kycStatusSchema = z.enum(['NONE', 'PENDING', 'VERIFIED', 'REJECTED']);

export const actorSchema = z.object({
  id: z.string().uuid(),
  role: userRoleSchema,
  kycStatus: kycStatusSchema,
});
export type Actor = z.infer<typeof actorSchema>;

export const ownerApplySchema = z.object({
  /** An opaque reference to a payout account held by the payment provider.
   *  Never a bank account number — we do not want to hold one. */
  payoutAccountRef: z.string().trim().min(3).max(120).optional(),
});
export type OwnerApplyInput = z.infer<typeof ownerApplySchema>;
