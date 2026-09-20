/**
 * Two database identities, deliberately separate DI tokens.
 *
 * PRISMA_SCOPED — connects as app_role. RLS applies. Everything that serves a
 *   user request uses this, through runScoped().
 *
 * PRISMA_ADMIN  — connects as the database owner. RLS is BYPASSED. Legitimate
 *   users: the webhook handler (no user context exists), BullMQ job workers
 *   (no user context exists), and explicit admin operations. Injecting it
 *   anywhere else is a data-leak waiting to happen, and CI greps for exactly
 *   that (see Phase 12).
 */
export const PRISMA_SCOPED = Symbol('PRISMA_SCOPED');
export const PRISMA_ADMIN = Symbol('PRISMA_ADMIN');
