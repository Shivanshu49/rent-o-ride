-- ===========================================================================
-- No table-level UPDATE for app_role, anywhere.
-- ===========================================================================
--
-- 20260921120000 took the grant away on the tables that had a known hole. It
-- left twelve others holding blanket `GRANT UPDATE` from the init migration,
-- which means the rule was "these specific columns are protected" rather than
-- "writes are declared". The difference shows up the day somebody adds an
-- UPDATE policy to a table that has none today: the grant is already there, so
-- the new policy is the only thing deciding what may be written, and we are
-- back to RLS-has-no-opinion-about-columns.
--
-- So: after this migration `app_role` holds ZERO table-level UPDATE. Every
-- column it can write is named, and `grant-surface.e2e-spec.ts` asserts the
-- whole surface — both directions, so a new table with an undeclared grant
-- fails CI rather than passing unnoticed.
--
-- Five of the tables below have RLS enabled and NO update policy at all today.
-- Their grant was doing nothing except waiting.
--
-- ===========================================================================
-- 1. Owner self-service: convert the blanket grant to named columns
-- ===========================================================================
--
-- These two are genuinely the owner's to edit — their own prices, their own
-- unavailable dates — and both have an owner-scoped FOR ALL policy. What the
-- blanket grant also allowed was repointing `vehicle_id` at somebody else's
-- vehicle. The policy's WITH CHECK would catch that today; naming the columns
-- means it does not have to be the only thing that does.

REVOKE UPDATE ON "rate_cards" FROM app_role;
GRANT  UPDATE ("hourly_paise", "daily_paise", "weekly_paise", "monthly_paise",
               "effective_from", "effective_to")
       ON "rate_cards" TO app_role;

REVOKE UPDATE ON "blackouts" FROM app_role;
-- `period` is GENERATED ALWAYS from start_at/end_at; writing it is 428C9
-- whatever the grant says, and listing it would imply otherwise.
GRANT  UPDATE ("start_at", "end_at", "reason") ON "blackouts" TO app_role;

-- ===========================================================================
-- 2. Written by PRISMA_ADMIN only — webhook handler, job workers, admin
-- ===========================================================================
--
-- None of these has a code path that writes through the request-scoped client,
-- and PRISMA_ADMIN is the table owner so the grant never applied to it. The
-- grant existed only as a way in for something that has not been written yet.
--
-- payments / refunds are the sharp ones: they have SELECT policies and no write
-- policy, so today nothing can write them — but they are the money, and the
-- grant is the half of the lock that was already open.

REVOKE UPDATE ON "payments"          FROM app_role;
REVOKE UPDATE ON "refunds"           FROM app_role;
REVOKE UPDATE ON "webhook_events"    FROM app_role;
REVOKE UPDATE ON "daily_metrics"     FROM app_role;
REVOKE UPDATE ON "demand_signals"    FROM app_role;
REVOKE UPDATE ON "coupons"           FROM app_role;
REVOKE UPDATE ON "platform_settings" FROM app_role;

-- Also INSERT and DELETE on the three that no user request may write at all.
-- A renter inserting their own `payments` row is the same class of problem as
-- updating one, and `risk_flags` is how the platform records that it does not
-- trust somebody — self-service deletion of that would be quite the feature.
REVOKE INSERT, UPDATE, DELETE ON "payments"       FROM app_role;
REVOKE INSERT, UPDATE, DELETE ON "refunds"        FROM app_role;
REVOKE INSERT, UPDATE, DELETE ON "risk_flags"     FROM app_role;
REVOKE INSERT, UPDATE, DELETE ON "webhook_events" FROM app_role;

-- ===========================================================================
-- 3. Computed, never authored
-- ===========================================================================
--
-- vehicle_ratings holds the Bayesian rating a job recomputes (Appendix F). It
-- has a public-read policy and no write policy. An owner who could write it
-- would simply be five stars.
--
-- reviews has a deliberately strict INSERT policy — author must be you, booking
-- must be COMPLETED — and no UPDATE policy, because editing a review after the
-- fact defeats the point. The grant said otherwise.

REVOKE INSERT, UPDATE, DELETE ON "vehicle_ratings" FROM app_role;
REVOKE UPDATE, DELETE ON "reviews" FROM app_role;

-- ===========================================================================
-- 4. Not ours: PostGIS metadata and the migration ledger
-- ===========================================================================
--
-- `GRANT ... ON ALL TABLES IN SCHEMA public` in the init migration is a
-- wildcard, and it caught everything that happened to live in `public` —
-- including PostGIS's metadata and Prisma's own bookkeeping.
--
-- _prisma_migrations is the worst of the set: app_role could rewrite migration
-- history, and unlike every table above it has NO row-level security, so the
-- grant was the only control. Nothing in the application reads it.

REVOKE ALL ON "_prisma_migrations" FROM app_role;

-- spatial_ref_sys is read by every ST_Transform; keep SELECT, drop the rest.
-- Corrupting an SRID definition would quietly move every vehicle on the map.
REVOKE INSERT, UPDATE, DELETE ON "spatial_ref_sys" FROM app_role;
REVOKE INSERT, UPDATE, DELETE ON "geometry_columns" FROM app_role;
REVOKE INSERT, UPDATE, DELETE ON "geography_columns" FROM app_role;

-- ===========================================================================
-- 5. DELETE grants with no DELETE policy behind them
-- ===========================================================================
--
-- DELETE is not a column privilege in Postgres — it is all-or-nothing per
-- table — so it cannot be narrowed the way UPDATE was. The rule that is left is
-- simpler: a DELETE grant with no DELETE policy is dead weight, and dead weight
-- becomes live the day somebody adds the policy.
--
-- Tables that keep DELETE do so because a policy already scopes it: users
-- (admin only), vehicles (the owner's own listing), rate_cards and blackouts
-- (the owner's own pricing and dates), coupons / daily_metrics /
-- demand_signals (admin-only FOR ALL).

REVOKE DELETE ON "bookings"       FROM app_role;  -- cancelled, never deleted: the money trail
REVOKE DELETE ON "kyc_documents"  FROM app_role;  -- deleting the evidence after a verdict
REVOKE DELETE ON "owner_profiles" FROM app_role;  -- no policy; withdrawal is an admin act
REVOKE DELETE ON "referrals"      FROM app_role;  -- no policy

-- trips is the exception to the rule: `trips_participant_all` DOES cover
-- DELETE, and that is the problem. The row holds odometer readings and handover
-- photos — the evidence in a damage dispute — so the party with the most reason
-- to remove it is a participant.
REVOKE DELETE ON "trips" FROM app_role;

-- platform_settings has an admin UPDATE policy and no INSERT or DELETE policy.
-- It is a single row, created by the init migration.
REVOKE INSERT, DELETE ON "platform_settings" FROM app_role;

-- ===========================================================================
-- 6. Assert it took
-- ===========================================================================

DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(table_name, ', ' ORDER BY table_name)
    INTO leaked
    FROM information_schema.table_privileges
   WHERE grantee = 'app_role'
     AND table_schema = 'public'
     AND privilege_type = 'UPDATE';

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'app_role still holds TABLE-level UPDATE on: %', leaked;
  END IF;
END
$$;
