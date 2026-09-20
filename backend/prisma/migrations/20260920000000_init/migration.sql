-- Rent-O-Ride initial migration.
--
-- Hand-written on purpose. Four things in here decide whether this is a real
-- system or a demo, and Prisma can express none of them:
--
--   1. bookings.period, a STORED GENERATED tstzrange
--   2. EXCLUDE USING gist, which makes double booking impossible at the
--      storage layer rather than hopefully-impossible in application code
--   3. PostGIS geography + a GIST index, so proximity search is an index scan
--   4. row-level security driven by transaction-local session variables,
--      because a pooled API role has no auth.uid()
--
-- Extensions come first: the vehicles.location column needs the geography type
-- to exist before CREATE TABLE runs.
--
-- WORKFLOW NOTE — do not run `prisma migrate dev` on this project.
-- Prisma reads a STORED GENERATED column's expression as an ordinary DEFAULT
-- and proposes `ALTER COLUMN period DROP DEFAULT` for it. Postgres rejects that
-- statement outright ("column period is a generated column"), so nothing can be
-- silently destroyed — but the generated migration is still wrong and will not
-- apply. Use `npm run db:diff` instead: it prints the incremental DDL from the
-- applied migrations to the current schema, which you review, edit and save as
-- a new migration, then apply with `prisma migrate deploy`.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'BIKE', 'BICYCLE', 'SCOOTER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'RENTED', 'MAINTENANCE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('QUOTED', 'PENDING_PAYMENT', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RENTER', 'OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('VEHICLE', 'OWNER', 'RENTER');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('DRIVING_LICENCE', 'ID_PROOF', 'ADDRESS_PROOF', 'SELFIE');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FLAT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'RENTER',
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_profiles" (
    "user_id" UUID NOT NULL,
    "payout_account_ref" TEXT,
    "commission_bps" INTEGER NOT NULL DEFAULT 1800,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "reliability" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "type" "VehicleType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "reg_number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT NOT NULL,
    "location" geography(Point, 4326),
    "status" "VehicleStatus" NOT NULL DEFAULT 'DRAFT',
    "min_hours" INTEGER NOT NULL DEFAULT 1,
    "deposit_paise" INTEGER NOT NULL DEFAULT 0,
    "included_km_per_day" INTEGER NOT NULL DEFAULT 0,
    "per_extra_km_paise" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "hourly_paise" INTEGER NOT NULL,
    "daily_paise" INTEGER NOT NULL,
    "weekly_paise" INTEGER,
    "monthly_paise" INTEGER,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blackouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "blackouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "renter_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'QUOTED',
    "quote_snapshot" JSONB NOT NULL DEFAULT '{}',
    "total_paise" INTEGER NOT NULL,
    "deposit_paise" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "booking_id" UUID NOT NULL,
    "picked_up_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "start_odo" INTEGER,
    "end_odo" INTEGER,
    "pickup_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "return_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "late_fee_paise" INTEGER NOT NULL DEFAULT 0,
    "km_overage_paise" INTEGER NOT NULL DEFAULT 0,
    "damage_paise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "method" TEXT,
    "captured_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "refund_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_ratings" (
    "vehicle_id" UUID NOT NULL,
    "bayesian_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effective_count" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_ratings_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "demand_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "available_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "demand_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "date" DATE NOT NULL,
    "city" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "bookings" INTEGER NOT NULL DEFAULT 0,
    "revenue_paise" INTEGER NOT NULL DEFAULT 0,
    "booked_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("date","city","vehicle_type")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "doc_type" "DocType" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "booking_id" UUID,
    "rule" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "code" TEXT NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount_paise" INTEGER,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6) NOT NULL,
    "usage_cap" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "referrals" (
    "code" TEXT NOT NULL,
    "referrer_id" UUID NOT NULL,
    "redeemed_by" UUID,
    "reward_paise" INTEGER NOT NULL DEFAULT 0,
    "redeemed_at" TIMESTAMPTZ(6),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "booking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "surge_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_surge_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.8,
    "gst_rate_bps" INTEGER NOT NULL DEFAULT 1800,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "vehicles_city_type_idx" ON "vehicles"("city", "type");

-- CreateIndex
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles"("owner_id");

-- CreateIndex
CREATE INDEX "rate_cards_vehicle_id_effective_from_idx" ON "rate_cards"("vehicle_id", "effective_from");

-- CreateIndex
CREATE INDEX "blackouts_vehicle_id_idx" ON "blackouts"("vehicle_id");

-- CreateIndex
CREATE INDEX "bookings_renter_id_created_at_idx" ON "bookings"("renter_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_vehicle_id_start_at_idx" ON "bookings"("vehicle_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_id_key" ON "payments"("payment_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_refund_id_key" ON "refunds"("refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "reviews_subject_type_subject_id_idx" ON "reviews"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_author_id_subject_type_key" ON "reviews"("booking_id", "author_id", "subject_type");

-- CreateIndex
CREATE UNIQUE INDEX "demand_signals_city_vehicle_type_window_start_key" ON "demand_signals"("city", "vehicle_type", "window_start");

-- CreateIndex
CREATE INDEX "kyc_documents_user_id_idx" ON "kyc_documents"("user_id");

-- CreateIndex
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents"("status");

-- CreateIndex
CREATE INDEX "risk_flags_user_id_created_at_idx" ON "risk_flags"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- AddForeignKey
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackouts" ADD CONSTRAINT "blackouts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ratings" ADD CONSTRAINT "vehicle_ratings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- 1. The no-double-booking guarantee
-- ===========================================================================

-- '[)' is half-open: a booking ending 17:00 does NOT conflict with one starting
-- 17:00. The common bug is to treat the range as closed, which blocks
-- back-to-back rentals and silently costs revenue.
--
-- GENERATED ALWAYS ... STORED means Postgres derives this column and rejects any
-- INSERT or UPDATE that names it. That is deliberate: start_at and end_at are
-- the only writable truth, so period can never drift out of sync with them.
ALTER TABLE "bookings"
  ADD COLUMN "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("start_at", "end_at", '[)')) STORED;

ALTER TABLE "blackouts"
  ADD COLUMN "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("start_at", "end_at", '[)')) STORED;

-- The headline constraint.
--
-- Two concurrent requests both run "SELECT ... WHERE period && $1", both see no
-- rows, both INSERT, and both succeed. Under READ COMMITTED that is a genuine
-- race, not a theoretical one, and it is the single most common bug in booking
-- systems. EXCLUDE USING gist makes the second INSERT fail with SQLSTATE 23P01
-- at the storage layer, atomically, with zero application coordination — and it
-- keeps working even for writes that never go through our API.
--
-- btree_gist is what lets a plain equality column (vehicle_id) share a GIST
-- index with a range operator (&&).
--
-- The WHERE clause makes it PARTIAL, which is what frees a slot the instant a
-- booking is cancelled or expires. Without it, a cancelled row would keep
-- holding its dates forever.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&)
  WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'ONGOING'));

-- No WHERE clause here: a blackout is unconditional. An owner blocking the
-- vehicle for service means blocked, in every state.
ALTER TABLE "blackouts"
  ADD CONSTRAINT "blackouts_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&);

-- ===========================================================================
-- 2. Geospatial
-- ===========================================================================

-- geography, not geometry: geography(Point,4326) gives true spheroid distance
-- in METRES. geometry with SRID 4326 measures in degrees, which is not a
-- distance at all — a degree of longitude is ~111 km at the equator and ~98 km
-- at Delhi's 28.6 N.
CREATE INDEX "vehicles_location_gix" ON "vehicles" USING gist ("location");

-- Partial: soft-deleted vehicles are never searchable, so they do not belong in
-- the index that search uses.
CREATE INDEX "vehicles_type_status_idx"
  ON "vehicles" ("type", "status")
  WHERE "deleted_at" IS NULL;

-- Supports the availability NOT EXISTS probe in Phase 4's search query.
CREATE INDEX "bookings_vehicle_period_gix"
  ON "bookings" USING gist ("vehicle_id", "period")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'ONGOING');

-- ===========================================================================
-- 3. Idempotency
-- ===========================================================================

-- Partial, because idempotency_key is null for bookings created without one
-- (seed data, admin actions). A plain unique index would collapse every null
-- key into a conflict on some Postgres configurations and is simply wrong here.
CREATE UNIQUE INDEX "bookings_idem_idx"
  ON "bookings" ("renter_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- webhook_events(provider, event_id) is already unique via the Prisma schema.
-- Inserting that row is the FIRST thing the webhook handler does: a replayed
-- event fails here, before any state changes.

-- ===========================================================================
-- 4. Check constraints
-- ===========================================================================

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_end_after_start" CHECK ("end_at" > "start_at");
ALTER TABLE "blackouts" ADD CONSTRAINT "blackouts_end_after_start" CHECK ("end_at" > "start_at");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Money is integer paise and is never negative. A negative amount reaching the
-- database means a bug upstream, and it should stop here rather than become a
-- refund nobody authorised.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_paise_non_negative"
  CHECK ("total_paise" >= 0 AND "deposit_paise" >= 0);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_paise_non_negative"
  CHECK ("deposit_paise" >= 0 AND "per_extra_km_paise" >= 0 AND "included_km_per_day" >= 0);
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_paise_non_negative"
  CHECK ("hourly_paise" >= 0 AND "daily_paise" >= 0
     AND ("weekly_paise" IS NULL OR "weekly_paise" >= 0)
     AND ("monthly_paise" IS NULL OR "monthly_paise" >= 0));
ALTER TABLE "payments" ADD CONSTRAINT "payments_paise_non_negative" CHECK ("amount_paise" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paise_non_negative" CHECK ("amount_paise" >= 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_paise_non_negative"
  CHECK ("late_fee_paise" >= 0 AND "km_overage_paise" >= 0 AND "damage_paise" >= 0);

-- An odometer that runs backwards is a data-entry error, not a negative charge.
ALTER TABLE "trips" ADD CONSTRAINT "trips_odo_forward"
  CHECK ("start_odo" IS NULL OR "end_odo" IS NULL OR "end_odo" >= "start_odo");

ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_commission_range"
  CHECK ("commission_bps" BETWEEN 0 AND 10000);
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_reliability_range"
  CHECK ("reliability" BETWEEN 0 AND 100);

ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_singleton" CHECK ("id" = 1);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_surge_sane"
  CHECK ("max_surge_multiplier" >= 1.0 AND "max_surge_multiplier" <= 5.0);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_gst_range"
  CHECK ("gst_rate_bps" BETWEEN 0 AND 10000);

-- ===========================================================================
-- 5. Row-level security, driven by session variables
-- ===========================================================================

-- Why these functions exist instead of auth.uid():
--
-- In a Supabase-client app the end user's JWT reaches Postgres and policies
-- evaluate auth.uid(). A NestJS API connects with ONE pooled role, so
-- auth.uid() is null on every request and every policy written against it is
-- decorative. We put the missing user context back with transaction-local
-- session variables, set by PrismaService.runScoped(), and point the policies
-- at those.
--
-- STABLE, not VOLATILE: the value cannot change inside a statement, so the
-- planner may call it once instead of once per row. On a sequential scan of
-- bookings that is the difference between a policy that costs nothing and one
-- that dominates the query.
--
-- The `true` second argument to current_setting means "return null if unset"
-- rather than raising — an anonymous request must get no rows, not a 500.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.user_role', true) = 'ADMIN', false)
$$;

-- app_role is created by docker/initdb/00-roles.sql (and by CI before
-- migrations run), because a role is cluster-wide while a migration is
-- database-scoped. Created there WITHOUT superuser and WITHOUT BYPASSRLS:
-- every policy below is meaningless if the connecting role can ignore it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    RAISE EXCEPTION 'role app_role is missing — run docker/initdb/00-roles.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'app_role has BYPASSRLS or SUPERUSER — every policy below would be decorative';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_role;

-- PostGIS puts its metadata in these; search would fail on a permission error
-- without them, in a way that looks like a query bug.
GRANT SELECT ON geometry_columns, geography_columns, spatial_ref_sys TO app_role;

-- Enable RLS everywhere. Note we do NOT use FORCE ROW LEVEL SECURITY: the
-- tables are owned by the migration role, which PRISMA_ADMIN connects as, and
-- that client is meant to bypass RLS (webhooks and job workers have no user
-- context to scope by). Forcing it would break them by design.
ALTER TABLE "users"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_profiles"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_cards"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blackouts"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_ratings"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demand_signals"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_metrics"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_documents"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_flags"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;

-- ---- users ---------------------------------------------------------------
CREATE POLICY users_self_read ON "users" FOR SELECT
  USING ("id" = app_user_id() OR app_is_admin());
CREATE POLICY users_self_update ON "users" FOR UPDATE
  USING ("id" = app_user_id() OR app_is_admin())
  WITH CHECK ("id" = app_user_id() OR app_is_admin());
-- Bootstrap: the first authenticated request creates the caller's own row.
CREATE POLICY users_self_insert ON "users" FOR INSERT
  WITH CHECK ("id" = app_user_id() OR app_is_admin());
CREATE POLICY users_admin_delete ON "users" FOR DELETE USING (app_is_admin());

-- ---- owner_profiles ------------------------------------------------------
-- Publicly readable: a renter needs to see that an owner is verified.
-- is_verified and commission_bps are NOT self-writable — an owner must not be
-- able to verify themselves or set their own commission to zero.
CREATE POLICY owner_profiles_read ON "owner_profiles" FOR SELECT USING (true);
CREATE POLICY owner_profiles_self_insert ON "owner_profiles" FOR INSERT
  WITH CHECK ("user_id" = app_user_id() OR app_is_admin());
CREATE POLICY owner_profiles_admin_write ON "owner_profiles" FOR UPDATE
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- ---- vehicles ------------------------------------------------------------
CREATE POLICY vehicles_public_read ON "vehicles" FOR SELECT
  USING (("status" = 'AVAILABLE' AND "deleted_at" IS NULL)
         OR "owner_id" = app_user_id()
         OR app_is_admin());
CREATE POLICY vehicles_owner_insert ON "vehicles" FOR INSERT
  WITH CHECK ("owner_id" = app_user_id() OR app_is_admin());
CREATE POLICY vehicles_owner_update ON "vehicles" FOR UPDATE
  USING ("owner_id" = app_user_id() OR app_is_admin())
  WITH CHECK ("owner_id" = app_user_id() OR app_is_admin());
CREATE POLICY vehicles_owner_delete ON "vehicles" FOR DELETE
  USING ("owner_id" = app_user_id() OR app_is_admin());

-- ---- rate_cards / blackouts ---------------------------------------------
-- Rates are public (search shows them); blackouts are not (why a vehicle is
-- unavailable is the owner's business, and Phase 6 returns only opaque ranges).
CREATE POLICY rate_cards_public_read ON "rate_cards" FOR SELECT USING (true);
CREATE POLICY rate_cards_owner_write ON "rate_cards" FOR ALL
  USING (EXISTS (SELECT 1 FROM "vehicles" v WHERE v."id" = "rate_cards"."vehicle_id"
                   AND (v."owner_id" = app_user_id() OR app_is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM "vehicles" v WHERE v."id" = "rate_cards"."vehicle_id"
                   AND (v."owner_id" = app_user_id() OR app_is_admin())));

CREATE POLICY blackouts_owner_all ON "blackouts" FOR ALL
  USING (EXISTS (SELECT 1 FROM "vehicles" v WHERE v."id" = "blackouts"."vehicle_id"
                   AND (v."owner_id" = app_user_id() OR app_is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM "vehicles" v WHERE v."id" = "blackouts"."vehicle_id"
                   AND (v."owner_id" = app_user_id() OR app_is_admin())));

-- ---- bookings ------------------------------------------------------------
CREATE POLICY bookings_renter_read ON "bookings" FOR SELECT
  USING ("renter_id" = app_user_id() OR app_is_admin());
CREATE POLICY bookings_owner_read ON "bookings" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "vehicles" v
                  WHERE v."id" = "bookings"."vehicle_id" AND v."owner_id" = app_user_id()));
-- A renter may only create bookings for themselves. This is the policy that
-- turns a forgotten WHERE clause from a data leak into an empty result.
CREATE POLICY bookings_renter_insert ON "bookings" FOR INSERT
  WITH CHECK ("renter_id" = app_user_id() OR app_is_admin());
CREATE POLICY bookings_participant_update ON "bookings" FOR UPDATE
  USING ("renter_id" = app_user_id() OR app_is_admin()
         OR EXISTS (SELECT 1 FROM "vehicles" v
                     WHERE v."id" = "bookings"."vehicle_id" AND v."owner_id" = app_user_id()));

-- ---- trips ---------------------------------------------------------------
CREATE POLICY trips_participant_all ON "trips" FOR ALL
  USING (EXISTS (SELECT 1 FROM "bookings" b WHERE b."id" = "trips"."booking_id"
                   AND (b."renter_id" = app_user_id() OR app_is_admin()
                        OR EXISTS (SELECT 1 FROM "vehicles" v
                                    WHERE v."id" = b."vehicle_id" AND v."owner_id" = app_user_id()))))
  WITH CHECK (EXISTS (SELECT 1 FROM "bookings" b WHERE b."id" = "trips"."booking_id"
                   AND (b."renter_id" = app_user_id() OR app_is_admin()
                        OR EXISTS (SELECT 1 FROM "vehicles" v
                                    WHERE v."id" = b."vehicle_id" AND v."owner_id" = app_user_id()))));

-- ---- payments / refunds --------------------------------------------------
-- No public read at any price. Writes come from the webhook handler, which
-- uses PRISMA_ADMIN because a webhook has no user context to scope by.
CREATE POLICY payments_participant_read ON "payments" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "bookings" b WHERE b."id" = "payments"."booking_id"
                   AND (b."renter_id" = app_user_id() OR app_is_admin()
                        OR EXISTS (SELECT 1 FROM "vehicles" v
                                    WHERE v."id" = b."vehicle_id" AND v."owner_id" = app_user_id()))));
CREATE POLICY refunds_participant_read ON "refunds" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "payments" p
                  JOIN "bookings" b ON b."id" = p."booking_id"
                 WHERE p."id" = "refunds"."payment_id"
                   AND (b."renter_id" = app_user_id() OR app_is_admin())));

-- ---- webhook_events ------------------------------------------------------
-- Admin only. These payloads carry provider-side payment detail.
CREATE POLICY webhook_events_admin ON "webhook_events" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- ---- reviews -------------------------------------------------------------
CREATE POLICY reviews_public_read ON "reviews" FOR SELECT USING (true);
-- Defence in depth: the service checks this too. Both, because a review
-- written without a completed booking is the whole ratings system compromised.
CREATE POLICY reviews_completed_booking_insert ON "reviews" FOR INSERT
  WITH CHECK (
    "author_id" = app_user_id()
    AND EXISTS (
      SELECT 1 FROM "bookings" b
       WHERE b."id" = "reviews"."booking_id"
         AND b."status" = 'COMPLETED'
         AND (b."renter_id" = app_user_id()
              OR EXISTS (SELECT 1 FROM "vehicles" v
                          WHERE v."id" = b."vehicle_id" AND v."owner_id" = app_user_id()))
    )
  );

-- ---- public reference data ----------------------------------------------
CREATE POLICY vehicle_ratings_public_read ON "vehicle_ratings" FOR SELECT USING (true);
CREATE POLICY platform_settings_public_read ON "platform_settings" FOR SELECT USING (true);
CREATE POLICY platform_settings_admin_write ON "platform_settings" FOR UPDATE
  USING (app_is_admin()) WITH CHECK (app_is_admin());
CREATE POLICY coupons_public_read ON "coupons" FOR SELECT USING (true);
CREATE POLICY coupons_admin_write ON "coupons" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- ---- analytics -----------------------------------------------------------
-- Written by job workers via PRISMA_ADMIN. Readable only by admins through the
-- scoped client; owner dashboards go through scoped repository methods that
-- filter to the owner's own vehicles.
CREATE POLICY demand_signals_admin ON "demand_signals" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());
CREATE POLICY daily_metrics_admin ON "daily_metrics" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- ---- compliance ----------------------------------------------------------
CREATE POLICY kyc_documents_self ON "kyc_documents" FOR SELECT
  USING ("user_id" = app_user_id() OR app_is_admin());
CREATE POLICY kyc_documents_self_insert ON "kyc_documents" FOR INSERT
  WITH CHECK ("user_id" = app_user_id());
CREATE POLICY kyc_documents_admin_update ON "kyc_documents" FOR UPDATE
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- A user may see that they were flagged, never the rule that flagged them —
-- that is handled at the service layer, which selects columns. Admin sees all.
CREATE POLICY risk_flags_self_read ON "risk_flags" FOR SELECT
  USING ("user_id" = app_user_id() OR app_is_admin());

CREATE POLICY audit_log_admin_read ON "audit_log" FOR SELECT USING (app_is_admin());
CREATE POLICY audit_log_insert ON "audit_log" FOR INSERT WITH CHECK (true);

-- ---- referrals -----------------------------------------------------------
CREATE POLICY referrals_own ON "referrals" FOR SELECT
  USING ("referrer_id" = app_user_id() OR "redeemed_by" = app_user_id() OR app_is_admin());
CREATE POLICY referrals_self_insert ON "referrals" FOR INSERT
  WITH CHECK ("referrer_id" = app_user_id() OR app_is_admin());

-- ===========================================================================
-- 6. Platform settings singleton
-- ===========================================================================

-- gst_rate_bps: 1800 = 18%, the rate for renting a vehicle without an operator
-- under HSN 9966/9973 at the time of writing. TODO: confirm the current rate
-- before quoting it in the report — it is a policy number, not a constant, and
-- putting a stale rate in writing is worse than leaving a blank.
INSERT INTO "platform_settings" ("id", "booking_enabled", "surge_enabled", "max_surge_multiplier", "gst_rate_bps")
VALUES (1, true, true, 1.8, 1800)
ON CONFLICT ("id") DO NOTHING;
