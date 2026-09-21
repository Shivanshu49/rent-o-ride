import { z } from 'zod';

/**
 * The error vocabulary, defined once for both apps.
 *
 * The web client switches on `code` and never on `message` — messages are for
 * humans and get reworded. Keeping the union here rather than in the API means
 * a code the client handles cannot quietly disappear from the server, or the
 * reverse: `tsc` says so.
 */
export const apiErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'KYC_REQUIRED',
  'NOT_FOUND',
  'SLOT_TAKEN',
  'PRICE_CHANGED',
  'QUOTE_EXPIRED',
  'QUOTE_INVALID',
  'INVALID_TRANSITION',
  'PUBLISH_REQUIREMENTS_UNMET',
  'RATE_CARD_INVALID',
  'BOOKING_DISABLED',
  'RISK_BLOCKED',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** The body every non-2xx response carries. `requestId` is the same value as
 *  the x-request-id header, so a screenshot is enough to find the log line. */
export const apiErrorBodySchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
