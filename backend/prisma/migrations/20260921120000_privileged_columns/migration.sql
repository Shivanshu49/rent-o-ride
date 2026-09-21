-- ===========================================================================
-- Privileged columns: app_role may no longer write the ones that grant
-- privilege, hold money, or drive a state machine.
-- ===========================================================================
--
-- WHAT WAS WRONG
--
-- 20260920000000_init granted app_role UPDATE on every table and then relied on
-- RLS to decide WHICH ROWS it could touch. RLS has no opinion about COLUMNS. So
-- `users_self_update` — "you may update your own row" — also meant "you may set
-- your own row's role to ADMIN". One forgotten column in one future repository
-- method, or one mass-assignment from a request body, and a renter is an admin.
--
-- The same shape appeared on INSERT. `kyc_documents_self_insert` checks only
-- `user_id = app_user_id()`, so a crafted insert with `status = 'VERIFIED'`
-- self-verifies KYC — the check that exists to stop us handing a car to an
-- unverified stranger. `owner_profiles_self_insert` likewise permits
-- `is_verified = true, commission_bps = 0`.
--
-- WHY COLUMN PRIVILEGES AND NOT A TRIGGER
--
-- A trigger is code: it runs after the write is attempted, it has to reproduce
-- the "is this an admin" test in a second place, and it can be dropped, made
-- to return NEW, or simply not fire on a path nobody thought about. A GRANT is
-- the access control system itself. Postgres refuses the statement before it
-- plans it, with 42501, for every client and every code path including psql —
-- and `\dp` prints exactly who may write what, which no trigger can.
--
-- THE RULE THAT REPLACES THE GRANT
--
-- Every legitimate change to a column revoked here goes through
-- PrivilegedWritesService (backend/src/modules/privileged/): PRISMA_ADMIN, one
-- named method per transition, an audit_log row written in the same
-- transaction. There is no second way in, and `\dp` is the proof.
--
-- ===========================================================================
-- 1. users — role and kyc_status are the privilege itself
-- ===========================================================================
--
-- Also locked: `auth_user_id`, the link to the Supabase identity. Repointing it
-- makes your row answer to somebody else's token. And `id`, which every foreign
-- key in the schema depends on.
--
-- Left writable: the contact details a person legitimately changes about
-- themselves.

REVOKE UPDATE, INSERT ON "users" FROM app_role;
GRANT  UPDATE ("full_name", "phone", "email") ON "users" TO app_role;
-- No INSERT grant at all. `users_self_insert` already made this unreachable for
-- app_role — a brand new row's id cannot equal the caller's app.user_id — and
-- the one real writer, the bootstrap in AuthRepository, runs on PRISMA_ADMIN
-- because no user context exists yet. Granting a path nothing uses is how the
-- next hole gets in.

-- ===========================================================================
-- 2. owner_profiles — verification status and the platform's commission
-- ===========================================================================
--
-- There was no self-UPDATE policy here, only `owner_profiles_admin_write`. The
-- grant is still wrong: it means the only thing standing between an owner and
-- `commission_bps = 0` is a policy somebody could widen in a later migration
-- while thinking about something else.
--
-- The INSERT hole was live. `POST /owners/apply` wrote `is_verified: false,
-- commission_bps: 1800` from application code; nothing in the database required
-- those values. Dropping both columns from the grant makes the column DEFAULTs
-- authoritative, so the honest values are the only reachable ones.

REVOKE UPDATE, INSERT ON "owner_profiles" FROM app_role;
-- No UPDATE grant of any kind, not even on payout_account_ref. There is no
-- self-UPDATE policy on this table — only `owner_profiles_admin_write` — so a
-- column grant here would be a grant nothing can reach, and a dead grant reads
-- like a permission somebody decided to allow. When Phase 7 adds "change my
-- payout account", it adds the policy and the named column grant in the same
-- migration, and the two are then legible together.
GRANT  INSERT ("user_id", "payout_account_ref") ON "owner_profiles" TO app_role;

-- ===========================================================================
-- 3. vehicles — status, because an owner must not un-suspend themselves
-- ===========================================================================
--
-- SUSPENDED is what an admin sets when a vehicle fails a safety check or the
-- owner is under investigation. `vehicles_owner_update` let the owner set the
-- column back to AVAILABLE and carry on renting it out.
--
-- A column grant cannot express "this transition but not that one", so the
-- whole column goes. DRAFT -> AVAILABLE (publish, Phase 3) and AVAILABLE ->
-- MAINTENANCE are legitimate owner actions and become named methods on
-- PrivilegedWritesService, which is the right home anyway: publishing has to
-- check `owner_profiles.is_verified` and both belong in the audit log.
--
-- `deleted_at` stays writable: soft-deleting your own listing is yours to do.

REVOKE UPDATE, INSERT ON "vehicles" FROM app_role;
GRANT  UPDATE ("type", "brand", "model", "reg_number", "year", "specs", "images",
               "city", "location", "min_hours", "deposit_paise",
               "included_km_per_day", "per_extra_km_paise", "deleted_at")
       ON "vehicles" TO app_role;
GRANT  INSERT ("id", "owner_id", "type", "brand", "model", "reg_number", "year",
               "specs", "images", "city", "location", "min_hours",
               "deposit_paise", "included_km_per_day", "per_extra_km_paise",
               "created_at")
       ON "vehicles" TO app_role;

-- ===========================================================================
-- 4. kyc_documents — status, the one that decides who gets handed a vehicle
-- ===========================================================================
--
-- This was the live one. `kyc_documents_self_insert` checks the owner of the
-- row and nothing else, so:
--
--   INSERT INTO kyc_documents (user_id, doc_type, storage_path, status)
--   VALUES (me, 'SELFIE', 'anything', 'VERIFIED');
--
-- ...self-verifies. The uploaded file is never looked at, because nothing in
-- the flow requires a human to look at it — the row asserts its own verdict.
--
-- Dropping status, reviewed_by and reviewed_at from the grant makes the
-- DEFAULT (PENDING) the only reachable value, and review an admin-only write.

REVOKE UPDATE, INSERT ON "kyc_documents" FROM app_role;
GRANT  INSERT ("id", "user_id", "doc_type", "storage_path", "created_at")
       ON "kyc_documents" TO app_role;
-- No UPDATE at all. A document is written once; a verdict on it is an admin
-- action, and `kyc_documents_admin_update` already says so.

-- ===========================================================================
-- 5. audit_log — a log you can write is not a log
-- ===========================================================================
--
-- `audit_log_insert WITH CHECK (true)` let any authenticated caller write any
-- audit row: forge an approval, attribute an action to another actor, or bury a
-- real entry under noise. Nothing legitimate needs it — every writer is
-- PRISMA_ADMIN, which is not subject to either the grant or the policy.

REVOKE INSERT, UPDATE, DELETE ON "audit_log" FROM app_role;
DROP POLICY IF EXISTS "audit_log_insert" ON "audit_log";

-- ===========================================================================
-- 6. bookings / trips — money and the booking state machine
-- ===========================================================================
--
-- No Phase 2 code writes these; Phase 6 and Phase 8 will. Revoking now means
-- those phases start from "transitions are privileged and audited" rather than
-- discovering it after a renter has set their own booking to COMPLETED, or
-- zeroed `total_paise`, or written off their own `late_fee_paise`.
--
-- `bookings_participant_update` and `trips_participant_all` remain: they are
-- the row-scoping half, and they apply again the moment a named grant is added
-- back for a specific column.

REVOKE UPDATE ON "bookings" FROM app_role;
REVOKE UPDATE ON "trips"    FROM app_role;

-- ===========================================================================
-- 7. referrals — reward_paise
-- ===========================================================================
--
-- `referrals_self_insert` checks the referrer is you. It does not check what
-- you are paying yourself.

REVOKE INSERT, UPDATE ON "referrals" FROM app_role;
GRANT  INSERT ("code", "referrer_id") ON "referrals" TO app_role;

-- ===========================================================================
-- 8. Future tables inherit the wrong default
-- ===========================================================================
--
-- The init migration left ALTER DEFAULT PRIVILEGES granting UPDATE on every
-- table created later. That is how this class of hole comes back: somebody adds
-- a table in Phase 7, it gets blanket UPDATE, and nobody notices. Narrow the
-- default to SELECT and INSERT so a new table's write surface has to be
-- declared on purpose.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON TABLES FROM app_role;

-- ===========================================================================
-- 9. Assert it took
-- ===========================================================================
--
-- A REVOKE against a privilege that was never granted succeeds silently, so a
-- typo in a column name would leave this migration green and the hole open.

DO $$
DECLARE
  leaked text;
BEGIN
  -- A REVOKE against a privilege that was never granted succeeds silently, so a
  -- typo in a column name above would leave this migration green and the hole
  -- wide open. Read the grants back rather than trusting the statements.
  --
  -- The privilege is named per column, not assumed to be both. A trip row is
  -- legitimately CREATED with its fee columns at pickup; it is the later
  -- rewrite that has to be an audited, admin-only act. Saying which one keeps
  -- this assertion honest instead of merely strict.
  SELECT string_agg(format('%s.%s (%s)', e.tbl, e.col, e.priv), ', ' ORDER BY e.tbl, e.col, e.priv)
    INTO leaked
    FROM (VALUES
      ('users',          'role',           'UPDATE'),
      ('users',          'role',           'INSERT'),
      ('users',          'kyc_status',     'UPDATE'),
      ('users',          'kyc_status',     'INSERT'),
      ('users',          'auth_user_id',   'UPDATE'),
      ('users',          'auth_user_id',   'INSERT'),
      ('owner_profiles', 'is_verified',    'UPDATE'),
      ('owner_profiles', 'is_verified',    'INSERT'),
      ('owner_profiles', 'commission_bps', 'UPDATE'),
      ('owner_profiles', 'commission_bps', 'INSERT'),
      ('owner_profiles', 'reliability',    'UPDATE'),
      ('owner_profiles', 'reliability',    'INSERT'),
      ('vehicles',       'status',         'UPDATE'),
      ('vehicles',       'status',         'INSERT'),
      ('vehicles',       'owner_id',       'UPDATE'),
      ('kyc_documents',  'status',         'UPDATE'),
      ('kyc_documents',  'status',         'INSERT'),
      ('kyc_documents',  'reviewed_by',    'UPDATE'),
      ('kyc_documents',  'reviewed_by',    'INSERT'),
      ('bookings',       'status',         'UPDATE'),
      ('bookings',       'total_paise',    'UPDATE'),
      ('trips',          'late_fee_paise', 'UPDATE'),
      ('trips',          'damage_paise',   'UPDATE'),
      ('referrals',      'reward_paise',   'UPDATE'),
      ('referrals',      'reward_paise',   'INSERT'),
      ('audit_log',      'actor_id',       'INSERT'),
      ('audit_log',      'actor_id',       'UPDATE')
    ) AS e(tbl, col, priv)
   WHERE EXISTS (
     SELECT 1
       FROM information_schema.column_privileges p
      WHERE p.grantee = 'app_role'
        AND p.table_schema = 'public'
        AND p.table_name = e.tbl
        AND p.column_name = e.col
        AND p.privilege_type = e.priv
   );

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'app_role can still write privileged columns: %', leaked;
  END IF;
END
$$;
