# Rent-O-Ride — Production Build Guide (NestJS + Next.js)

Multi-vehicle rental platform (car / bike / bicycle / scooter).
Execution manual: architecture decisions, phase-by-phase build order, a paste-ready prompt for every phase, and every algorithm + formula with real math.

**How to use this:** work phase by phase. Paste the phase prompt into Claude Code, review the diff, test, commit, move on. Don't skip ahead — Phase 6 depends on Phase 5, Phase 7 depends on Phase 6.

---

## 0. Architecture decisions (locked)

| Concern | Choice | Why |
|---|---|---|
| Monorepo | **Turborepo + pnpm workspaces** | Shared types/schemas between web and api without publishing packages |
| Backend | **NestJS 11** (Fastify adapter) | Modules, DI, guards, interceptors, pipes. Fastify over Express for throughput. |
| Frontend | **Next.js 15 (App Router)** — UI only | No business logic. Calls the API. |
| Language | **TypeScript strict** everywhere | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` |
| DB | **PostgreSQL 15+ with PostGIS + btree_gist** | Range exclusion constraints + geospatial KNN. The core of the project. |
| ORM | **Prisma** for CRUD, **raw SQL** for geo + range | Prisma can't express `tstzrange` / `EXCLUDE` / `<->`. Use `$queryRaw`. |
| Auth | **Supabase Auth** issues tokens; **Nest verifies the JWT** | Free OTP delivery, but Nest owns authorization |
| Authorization | **Nest guards + repository-level scoping** (primary), **RLS** (defense-in-depth) | See §0.3 — this changes materially vs. a Next-only build |
| File storage | **Supabase Storage**, private buckets, signed URLs minted by Nest | KYC docs and damage photos must never be public |
| Payments | **Razorpay** — Orders API, webhook-driven confirmation | Never trust client-side success |
| Jobs / queues | **BullMQ + Redis**, `@nestjs/schedule` for cron triggers | Retries, backoff, dead-letter, observability — the real reason to use Nest |
| Realtime | **Nest WebSocket gateway (socket.io)** | Nest owns every write, so it can emit precisely. Better than DB change-streams here. |
| Maps | **MapLibre GL + OSM tiles** (free) or Mapbox GL | No card needed for MapLibre + OSM |
| Money | **integer paise (`Int`), never floats** | `1999` = ₹19.99. Float money = rounding bugs. |
| Time | **store UTC `timestamptz`, render IST** | Never store naive timestamps |
| Validation | **Zod** in `packages/shared`, via `nestjs-zod` | One schema, used by DTOs and the web forms |
| API docs | **Swagger/OpenAPI** auto-generated from DTOs | `@nestjs/swagger` — free deliverable for your report |
| Testing | **Vitest** (unit/domain) + **Jest e2e** (Nest supertest) + **Playwright** (browser) | Pricing engine tests are your strongest report artifact |

### 0.1 Why NestJS here

The honest case: BullMQ job orchestration with retries and dead-letter queues, a WebSocket gateway that emits on exactly the transitions you control, guards/interceptors as first-class cross-cutting concerns, and auto-generated OpenAPI. Plus it's a separately deployable API a mobile client could consume later.

The cost you're accepting: two deploy targets, CORS + token plumbing, and RLS no longer protecting you for free (see §0.3). Budget an extra 3–4 days across the project for that overhead.

### 0.2 Non-negotiable production rules

1. **Money is integer paise.** No `Float`, no `Decimal` arithmetic in JS.
2. **The database enforces no-double-booking**, not application code.
3. **A price quote is signed and stored.** The price the user saw is the price charged.
4. **Payment state comes from webhooks**, verified by HMAC. Client callback is a UX hint only.
5. **Every write touching money runs in one transaction** with explicit failure handling.
6. **All mutations are idempotent** (idempotency keys on booking create, event IDs on webhooks).
7. **Every query is scoped to the caller** at the repository layer. Never `findMany()` without a tenant filter.
8. **`packages/domain` has zero I/O imports.** Enforced by lint, not by discipline.

### 0.3 Authorization: what changes vs. a Next-only build

This is the one thing people get wrong when moving to a separate API, so read it twice.

In a Supabase-client-driven app, RLS is your primary authorization: the user's own JWT reaches Postgres and policies evaluate against `auth.uid()`. **A NestJS API connects with one pooled database role.** If that role is the service role, RLS is bypassed entirely and every policy you wrote is decorative. A single missing `WHERE owner_id = ?` becomes a full data leak.

So:

- **Primary authorization = Nest guards + repository scoping.** Every repository method takes an `actor` and filters on it. There is no unscoped read of `bookings`, `payments`, or `kyc_documents`.
- **Defense-in-depth = RLS still on, driven by a session variable.** Connect as a non-superuser app role that RLS applies to, and open every request's transaction with:

  ```sql
  SELECT set_config('app.user_id', $1, true);   -- true = transaction-local
  SELECT set_config('app.user_role', $2, true);
  ```

  Policies then read `current_setting('app.user_id', true)::uuid` instead of `auth.uid()`. A forgotten filter in a repository gets caught by the policy instead of leaking.
- **A separate service-role connection** exists only for the webhook handler, the job workers, and admin operations — explicitly, in named providers, never as the default client.

Write this in your report. "We moved authorization into guards and kept RLS as a transaction-scoped backstop because a pooled API role bypasses `auth.uid()`" is exactly the kind of reasoning that separates a real backend from a tutorial.

### 0.4 Repo layout

```
rent-o-ride/
├─ turbo.json
├─ pnpm-workspace.yaml
├─ apps/
│  ├─ api/                          # NestJS
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/             # hand-written SQL for PostGIS + EXCLUDE + RLS
│  │  │  └─ seed.ts
│  │  ├─ src/
│  │  │  ├─ main.ts                 # Fastify adapter, raw-body for webhooks, Swagger
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/
│  │  │  │  ├─ guards/              # JwtAuthGuard, RolesGuard, KycGuard
│  │  │  │  ├─ interceptors/        # logging+requestId, idempotency, serialization
│  │  │  │  ├─ filters/             # PrismaExceptionFilter (23P01 -> 409), AllExceptions
│  │  │  │  ├─ pipes/               # ZodValidationPipe
│  │  │  │  └─ decorators/          # @CurrentUser, @Roles, @Idempotent, @Public
│  │  │  ├─ prisma/                 # PrismaService (+ runScoped with set_config)
│  │  │  ├─ config/                 # @nestjs/config + zod-validated env
│  │  │  └─ modules/
│  │  │     ├─ auth/  users/  vehicles/  search/  pricing/
│  │  │     ├─ bookings/  payments/  trips/  reviews/
│  │  │     ├─ risk/  admin/  analytics/
│  │  │     ├─ jobs/                # BullMQ processors + schedulers
│  │  │     ├─ events/              # WebSocket gateway
│  │  │     └─ storage/
│  │  └─ test/                      # Jest e2e (supertest)
│  └─ web/                          # Next.js — UI only
│     └─ src/{app,components,lib}   # lib/api-client.ts is the ONLY place fetch lives
└─ packages/
   ├─ domain/                       # PURE business logic, zero I/O — the heart
   │  └─ src/
   │     ├─ pricing/{engine.ts,strategies/,modifiers/,config.ts}
   │     ├─ availability/{overlap.ts,slots.ts}
   │     ├─ booking/{stateMachine.ts,cancellation.ts,lateFee.ts}
   │     ├─ reputation/{bayesian.ts,decay.ts}
   │     ├─ ranking/{score.ts,recommend.ts}
   │     ├─ risk/velocity.ts
   │     └─ money.ts
   ├─ shared/                       # zod schemas + DTO types + enums, used by BOTH apps
   └─ config/                       # eslint, tsconfig, prettier bases
```

**Each Nest module is `*.module.ts` + `*.controller.ts` + `*.service.ts` + `*.repository.ts` + `dto/` + `*.spec.ts`.** Controllers do HTTP only. Services orchestrate. Repositories own Prisma. Domain logic lives in `packages/domain` and is called by services.

---

## Phase 0 — Monorepo bootstrap

**Goal:** Turborepo with a booting Nest API, a booting Next app, shared packages, CI green.

### Prompt

```
Bootstrap a production-grade Turborepo monorepo called "rent-o-ride" with pnpm workspaces.

Structure:
  apps/api          -> NestJS 11 with the Fastify adapter
  apps/web          -> Next.js 15 App Router + Tailwind
  packages/domain   -> pure TS library, no runtime deps beyond date-fns
  packages/shared   -> zod schemas + shared types/enums
  packages/config   -> shared eslint/tsconfig/prettier bases

Requirements:

1. TypeScript strict everywhere: "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true, "exactOptionalPropertyTypes": true. packages/config/tsconfig.base.json extended by all others.

2. apps/api deps: @nestjs/{common,core,platform-fastify,config,swagger,schedule,jwt,bullmq,websockets,platform-socket.io,terminus,throttler} prisma @prisma/client zod nestjs-zod bullmq ioredis razorpay jose pino nestjs-pino @supabase/supabase-js date-fns
   Dev: @nestjs/testing jest supertest ts-jest vitest fast-check

3. apps/api/src/main.ts must:
   - use the Fastify adapter
   - register a rawBody hook so ONLY /webhooks/* routes keep the unparsed body buffer (webhook HMAC verification needs the exact bytes — Fastify parses JSON by default)
   - enable a global ZodValidationPipe, a global logging interceptor generating and propagating x-request-id, and global exception filters
   - Swagger at /docs, served only when NODE_ENV !== 'production' or behind basic auth
   - CORS for WEB_ORIGIN only, with credentials. No wildcard.
   - app.enableShutdownHooks() so BullMQ workers drain cleanly

4. Config module: @nestjs/config with a Zod schema validating every env var at boot. The app must REFUSE to start on a missing/malformed var, printing exactly which one. Vars: DATABASE_URL, DIRECT_URL, REDIS_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, QUOTE_SIGNING_SECRET, WEB_ORIGIN, PORT, NODE_ENV.

5. PrismaService in apps/api/src/prisma/: extends PrismaClient, implements OnModuleInit/OnModuleDestroy. Expose TWO clients as separate DI providers:
   - PRISMA_SCOPED -> connects as the app role (RLS applies)
   - PRISMA_ADMIN  -> service role, RLS bypassed, documented as "webhooks, job workers, admin only"
   Add runScoped(actor, fn): opens an interactive transaction, calls
     SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)
   then runs fn. Comment explaining why this exists (a pooled API role bypasses auth.uid()).

6. packages/domain/src/money.ts: a Paise branded type (integer paise) with toPaise, toRupees, formatINR, addPaise, subPaise, mulPaise(paise, multiplier) rounding half-up and returning an integer. No float escapes. Full unit tests: negative multipliers, zero, large values, repeated chaining.

7. Lint boundary enforcement — architectural, MUST fail CI:
   - packages/domain may not import @prisma/client, @nestjs/*, next/*, @supabase/*, ioredis, bullmq
   - apps/web may not import @prisma/client or anything from apps/api
   - controllers may not import PrismaService directly (only repositories may)
   Use eslint-plugin-boundaries or no-restricted-imports with clear error messages.

8. turbo.json pipeline: build, lint, typecheck, test, test:e2e with correct dependsOn and outputs.

9. GitHub Actions: typecheck + lint + unit tests on push; a separate e2e job with postgis/postgis:15-3.4 and redis:7 service containers.

10. docker-compose.yml for local dev: postgis/postgis:15-3.4 and redis:7, healthchecks on both.

11. .env.example for both apps, and a README with the exact local setup command sequence.

Show me the diff. Do not commit or push.
```

---

## Phase 1 — Database: schema, constraints, RLS

The phase that decides production-grade vs. toy. Spend real time here.

### The schema

```
users            id, auth_user_id, full_name, phone, email, role, kyc_status, created_at
owner_profiles   user_id, payout_account_ref, commission_bps, is_verified
vehicles         id, owner_id, type, brand, model, reg_number, year,
                 specs jsonb, images text[], city, location geography(Point,4326),
                 status, min_hours, deposit_paise, included_km_per_day,
                 per_extra_km_paise, created_at, deleted_at
rate_cards       id, vehicle_id, hourly_paise, daily_paise, weekly_paise, monthly_paise,
                 effective_from, effective_to
blackouts        id, vehicle_id, period tstzrange, reason
bookings         id, vehicle_id, renter_id, start_at, end_at, period tstzrange GENERATED,
                 status, quote_snapshot jsonb, total_paise, deposit_paise,
                 idempotency_key, expires_at, created_at, confirmed_at, cancelled_at
trips            booking_id, picked_up_at, returned_at, start_odo, end_odo,
                 pickup_photos text[], return_photos text[], late_fee_paise, km_overage_paise
payments         id, booking_id, provider, order_id, payment_id, amount_paise,
                 status, method, captured_at, raw jsonb
refunds          id, payment_id, refund_id, amount_paise, reason, status
webhook_events   id, provider, event_id UNIQUE, payload jsonb, processed_at
reviews          id, booking_id, author_id, subject_type, subject_id, rating, body, created_at
vehicle_ratings  vehicle_id, bayesian_rating, effective_count, refreshed_at
demand_signals   id, city, vehicle_type, window_start, requests, available_count
daily_metrics    date, city, vehicle_type, bookings, revenue_paise, booked_hours, available_hours
kyc_documents    id, user_id, doc_type, storage_path, status, reviewed_by, reviewed_at
risk_flags       id, user_id, booking_id, rule, score, created_at
coupons          code, kind, value, max_discount_paise, valid_from, valid_to, usage_cap
referrals        code, referrer_id, redeemed_by, reward_paise, redeemed_at
platform_settings  booking_enabled, surge_enabled, max_surge_multiplier, gst_rate_bps
audit_log        id, actor_id, action, entity, entity_id, before jsonb, after jsonb, at
```

### The SQL Prisma cannot generate

**1. No-double-booking (the headline feature)**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD COLUMN period tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
  WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'ONGOING'));

ALTER TABLE blackouts
  ADD CONSTRAINT blackouts_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
```

`'[)'` = half-open: a booking ending 17:00 does **not** conflict with one starting 17:00. Partial (`WHERE`) so a cancelled booking frees the slot instantly.

**2. Geospatial**

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE vehicles ADD COLUMN location geography(Point, 4326);
CREATE INDEX vehicles_location_gix ON vehicles USING gist (location);
CREATE INDEX vehicles_type_status_idx ON vehicles (type, status) WHERE deleted_at IS NULL;
```

**3. Idempotency**

```sql
CREATE UNIQUE INDEX bookings_idem_idx ON bookings (renter_id, idempotency_key);
CREATE UNIQUE INDEX webhook_events_event_idx ON webhook_events (provider, event_id);
```

**4. RLS driven by session variables (not `auth.uid()`)**

```sql
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.user_role', true) = 'ADMIN', false)
$$;

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookings_renter_read ON bookings FOR SELECT
  USING (renter_id = app_user_id() OR app_is_admin());

CREATE POLICY bookings_owner_read ON bookings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = bookings.vehicle_id AND v.owner_id = app_user_id()
  ));
```

### Prompt

```
Build the complete database layer for rent-o-ride in apps/api.

1. apps/api/prisma/schema.prisma with the models below. ALL money is Int named *_paise. ALL timestamps are DateTime @db.Timestamptz(6). Use Unsupported("tstzrange") and Unsupported("geography(Point,4326)") so Prisma doesn't drop those columns.

[paste the schema block from the guide]

Enums:
  VehicleType: CAR | BIKE | BICYCLE | SCOOTER
  VehicleStatus: DRAFT | AVAILABLE | RENTED | MAINTENANCE | SUSPENDED
  BookingStatus: QUOTED | PENDING_PAYMENT | CONFIRMED | ONGOING | COMPLETED | CANCELLED | EXPIRED | DISPUTED
  PaymentStatus: CREATED | AUTHORIZED | CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED
  UserRole: RENTER | OWNER | ADMIN
  KycStatus: NONE | PENDING | VERIFIED | REJECTED
  SubjectType: VEHICLE | OWNER | RENTER

2. A hand-written migration SQL file (a real migration, not db push) that:
   - enables postgis, btree_gist, pgcrypto
   - adds bookings.period as a STORED GENERATED column: tstzrange(start_at, end_at, '[)')
   - adds the PARTIAL exclusion constraint bookings_no_overlap on (vehicle_id WITH =, period WITH &&) WHERE status IN ('PENDING_PAYMENT','CONFIRMED','ONGOING')
   - adds the same exclusion on blackouts, no WHERE clause
   - adds vehicles.location geography(Point,4326) + GIST index
   - adds unique indexes: bookings(renter_id, idempotency_key), webhook_events(provider, event_id)
   - CHECK constraints: bookings.end_at > start_at; reviews.rating BETWEEN 1 AND 5; all *_paise >= 0; trips.end_odo >= start_odo when both non-null
   - creates app_user_id() and app_is_admin() as STABLE SQL functions reading current_setting('app.user_id'/'app.user_role', true)
   - creates a non-superuser role "app_role" that RLS applies to, grants it CRUD on all tables, and does NOT grant BYPASSRLS
   - enables RLS on every table with policies written against app_user_id()/app_is_admin(), NOT auth.uid():
       users: self read/update; admin all
       vehicles: public read where status='AVAILABLE' AND deleted_at IS NULL; owner full CRUD on own; admin all
       bookings: renter reads own; vehicle owner reads bookings on their vehicles; INSERT only where renter_id = app_user_id(); admin all
       payments, refunds, kyc_documents, risk_flags, audit_log: row-owner + admin only, no public read
       reviews: public read; INSERT only if the author has a COMPLETED booking for that subject
   - seeds one platform_settings row: booking_enabled=true, surge_enabled=true, max_surge_multiplier=1.8, gst_rate_bps=<leave a TODO comment; I must confirm the current rate>

3. Wire PrismaService.runScoped(actor, fn) so every logged-in read/write goes through a transaction with app.user_id / app.user_role set.

4. apps/api/prisma/seed.ts: 3 owners, 12 vehicles across all 4 types in Greater Noida / Noida / Delhi with REAL lat-lng, realistic INR rate cards in paise, a few blackouts, 6 renters, ~20 completed bookings with reviews spread over the last 90 days (so analytics and the Bayesian rating have data).

5. Tests that PROVE the guarantees — use a real Postgres+PostGIS, do not mock:
   - two concurrent transactions inserting overlapping bookings for one vehicle: the second fails with Postgres code 23P01
   - a booking ending exactly when another starts is ALLOWED
   - cancelling a booking makes the slot immediately re-bookable
   - RLS: connected as app_role with app.user_id = renter A, SELECT on bookings returns zero rows belonging to renter B

Show the diff. Do not run migrations against a remote DB without asking.
```

---

## Phase 2 — Auth module, guards, KYC scaffold

### Prompt

```
Implement the auth module in apps/api and the auth flow in apps/web.

Split of responsibility: Supabase Auth issues tokens (it delivers the OTP SMS). NestJS verifies them and owns ALL authorization. The web app never talks to the database.

1. apps/api/src/modules/auth/:
   - JwtAuthGuard: reads the Bearer token and verifies the Supabase JWT. Support both HS256 shared-secret (SUPABASE_JWT_SECRET) and asymmetric JWKS verification via `jose` with a cached remote JWK set; put the choice behind a config flag. Verify iss, aud, exp. On success load our `users` row by auth_user_id and attach a typed AuthActor { id, role, kycStatus } to the request.
   - RolesGuard + @Roles('OWNER','ADMIN') reading metadata via Reflector.
   - KycGuard + @RequiresKyc() for routes needing a verified renter (booking creation, pickup).
   - @Public() to opt a route out. Register JwtAuthGuard GLOBALLY so forgetting to protect a route fails CLOSED, not open. Write a test that an unannotated route returns 401.
   - @CurrentUser() param decorator returning AuthActor.
   - Users bootstrap: on first authenticated request, if no `users` row exists for that auth_user_id, create one (RENTER, kyc_status NONE). Handle the race where two concurrent requests both try — unique constraint on auth_user_id, catch and re-read.

2. Role elevation: POST /owners/apply creates owner_profiles with is_verified=false, commission_bps=1800. An unverified owner cannot publish vehicles (enforced in Phase 3).

3. KYC: POST /kyc/documents returns a short-lived SIGNED UPLOAD URL for a PRIVATE Supabase Storage bucket "kyc", minted server-side with the service-role client. The client uploads straight to storage; we store only the path in kyc_documents. GET /kyc/documents/:id returns a 60-second signed read URL after an ownership/admin check.
   Do NOT store Aadhaar numbers, license numbers, or any raw ID number in the database — only the document path and a verification status. Add a code comment saying why.

4. OTP rate limiting: max 5 requests per phone per hour via a Redis-backed ThrottlerStorage. Return 429 with Retry-After.

5. apps/web: a typed API client in src/lib/api-client.ts that is the ONLY place fetch() appears. It attaches the Supabase access token, refreshes once on 401, and maps API error codes to typed errors. Login/OTP screens use the Supabase client for the auth handshake only.

6. Tests (Jest e2e): 401 without a token, 403 with the wrong role, 403 when KYC is required and missing, tampered JWT signature rejected.

Show the diff.
```

---

## Phase 3 — Vehicles module

### Prompt

```
Implement the vehicles module in apps/api plus the owner listing UI in apps/web.

1. VehiclesModule with controller / service / repository. Endpoints:
   POST   /vehicles                  (OWNER, verified)
   GET    /vehicles/:id              (public)
   PATCH  /vehicles/:id              (owner of record)
   DELETE /vehicles/:id              (soft delete -> deleted_at)
   POST   /vehicles/:id/publish      (DRAFT -> AVAILABLE)
   GET    /owners/me/vehicles        (OWNER)
   POST   /vehicles/:id/rate-cards
   POST   /vehicles/:id/blackouts
   DELETE /vehicles/:id/blackouts/:blackoutId

2. Publish gate as a PURE function in packages/domain: canPublish(vehicle, rateCard, owner) -> Result<true, string[]> returning EVERY missing requirement (>=3 images, a rate card, a location, owner verified). The service maps failure to 422 with the list. Unit test each missing-requirement combination.

3. Type-specific specs validated by a Zod DISCRIMINATED UNION on vehicle type, defined in packages/shared so web and api share it:
   CAR:     { seats, fuel: 'petrol'|'diesel'|'ev'|'cng', transmission: 'manual'|'automatic', ac: boolean, luggage }
   BIKE:    { engineCc, hasGear: boolean, helmetsIncluded }
   SCOOTER: { engineCc?, isElectric: boolean, rangeKm?, helmetsIncluded }
   BICYCLE: { gears, frameSize: 'S'|'M'|'L', isElectric: boolean, helmetIncluded: boolean }
   A CAR sent bicycle specs must be rejected. Test it.

4. Rate card validation: reject unless daily < hourly*24, weekly < daily*7, monthly < weekly*4. Bicycles may have null weekly/monthly. 422 naming which rule failed.

5. Images: a public "vehicle-images" bucket, signed upload URLs from the API. The web client resizes to max 1600px before upload and generates a tiny base64 placeholder stored with the path.

6. Blackouts: reject one overlapping an existing CONFIRMED/ONGOING booking. Attempt the insert and catch 23P01 from the blackouts exclusion constraint, PLUS an explicit pre-check query so the error can name the conflicting booking dates.

7. apps/web /owner/listings: vehicle table with status, a publish checklist showing exactly what's missing, and a calendar view of bookings + blackouts.

Show the diff.
```

---

## Phase 4 — Search module (geo + ranking)

### Prompt

```
Implement the search module in apps/api and the search UI in apps/web.

1. POST /search with DTO { lat, lng, radiusKm, type?, startAt, endAt, minPaise?, maxPaise?, specFilters?, sort?, cursor? }.

2. SearchRepository does it in ONE round trip via $queryRaw. Logic in order:
   a. filter deleted_at IS NULL, status='AVAILABLE', type match
   b. geo filter: ST_DWithin(location, ST_MakePoint(:lng,:lat)::geography, :radiusMeters)
   c. availability: NOT EXISTS a booking with status IN ('PENDING_PAYMENT','CONFIRMED','ONGOING') where period && tstzrange(:startAt,:endAt,'[)'); AND NOT EXISTS an overlapping blackout
   d. select ST_Distance(location, :point) AS distance_m
   e. join vehicle_ratings for the MATERIALIZED Bayesian rating — never compute it in this query
   f. order by the ranking score, keyset-paginate on (score, id)

3. Ranking score: a pure function in packages/domain/src/ranking/score.ts, MIRRORED in the SQL ORDER BY so ordering happens in the DB:

   dNorm   = min(distance_m / radius_m, 1)
   pNorm   = (price - minPriceInResultSet) / max(1, maxPrice - minPrice)
   rNorm   = (bayesianRating - 1) / 4
   recency = exp(-daysSinceLastRented / 30)
   score   = 0.35*(1-dNorm) + 0.30*rNorm + 0.25*(1-pNorm) + 0.10*recency

   Weights in one exported WEIGHTS const. Unit test: closer beats farther (else equal); better-rated beats worse; weights sum to exactly 1.

4. A no-PostGIS fallback behind config flag USE_POSTGIS=false using Haversine plus a bounding-box pre-filter (see Appendix E). Same results, slower. Keep both paths tested.

5. Record a demand_signals row per search so the pricing engine has real D/S data: increment requests for (city, type, current 15-min window). Do it via a fire-and-forget BullMQ job, NOT inline — search latency must not depend on it.

6. apps/web search page: filter sidebar, result cards (image, type badge, brand/model, ₹/hr and ₹/day, rating + review count, "1.2 km away"), MapLibre map with markers synced to the list (hovering a card highlights its marker). Debounce filters 300ms, skeleton loaders, empty state.

7. Subscribe to the Phase 6 WebSocket gateway: when a booking is confirmed for a vehicle in the current result list, grey that card out live with a "just booked" badge.

8. Add EXPLAIN ANALYZE output for the search query to docs/performance.md. Confirm an Index Scan on vehicles_location_gix, not a Seq Scan.

Show the diff.
```

---

## Phase 5 — Pricing engine (pure domain)

**The most important phase for your report and viva.** Build and test it in `packages/domain` before wiring anything.

Full math in [Appendix A](#appendix-a--pricing-math). Read it first.

### Prompt

```
Implement the Rent-O-Ride pricing engine as a PURE module in packages/domain/src/pricing/. Zero I/O: no DB, no fetch, no Date.now() (pass `now` in). It must not import @nestjs/*, @prisma/client, or anything in apps/.

Types:

  type PricingContext = {
    now: Date
    startAt: Date
    endAt: Date
    vehicle:  { id, type, minHours, depositPaise, includedKmPerDay, perExtraKmPaise }
    rateCard: { hourlyPaise, dailyPaise, weeklyPaise|null, monthlyPaise|null }
    market:   { activeRequests, availableVehicles, occupancyRatio }
    previousSurge: number | null
    calendar: { weekendShare: number, holidayShare: number, seasonMultiplier: number }
    coupon?:  { kind: 'PERCENT'|'FLAT', value: number, maxDiscountPaise: number|null }
    addOns:   { deliveryPaise?, helmetPaise?, insurancePaise? }
    settings: { surgeEnabled: boolean, maxSurgeMultiplier: number, gstRateBps: number }
    config:   PricingConfig
  }

  type PriceBreakdown = {
    durationHours, billedUnits, slabUsed: 'HOURLY'|'DAILY'|'WEEKLY'|'MONTHLY'
    baseFarePaise
    modifiers: { surge, occupancy, leadTime, seasonal, longDuration }  // each { multiplier, reason }
    clampApplied: 'FLOOR'|'CEIL'|null
    adjustedFarePaise
    discountPaise, addOnsPaise, taxablePaise, gstPaise, totalPaise
    depositPaise, payableNowPaise
    includedKm, perExtraKmPaise
    lines: Array<{ label: string, amountPaise: number }>
  }

Implement this spec LITERALLY — do not improvise the formulas:

[paste Appendix A]

Structure:
- strategies/{car,bike,bicycle,scooter}.ts implementing VehiclePricingStrategy with computeBaseFare(ctx) and per-type rules. BICYCLE: hourly only, surge hard-capped at 1.0, deposit max ₹500. CAR: deposit required, km overage applies. BIKE/SCOOTER: helmet add-on.
- modifiers/{surge,occupancy,leadTime,seasonal,longDuration}.ts — each pure, returning { multiplier, reason }
- engine.ts — composes strategy + modifiers, applies the guardrail clamp, GST, line items
- config.ts — every constant in one place, each with a comment on what it does and why that value

Tests (engine.spec.ts) must cover:
- the exact worked example from the spec: assert adjustedFarePaise === 147166 to the paise
- slab crossover: 23h picks HOURLY, 25h picks DAILY, 8 days picks WEEKLY
- min_hours enforcement on a 30-minute bike booking
- surge clamped at maxSurgeMultiplier when D/S ratio is 10
- surge === 1.0 exactly when availableVehicles is 0 (no divide-by-zero, and don't punish users for empty data)
- surge === 1.0 when settings.surgeEnabled is false (kill switch)
- BICYCLE never surges regardless of market
- guardrail clamp: never below 0.70x or above 2.00x baseFare, and clampApplied reports which fired
- coupon capped by maxDiscountPaise; discount never exceeds the fare
- GST computed on (adjusted - discount + addOns), NEVER on the deposit
- every returned amount satisfies Number.isInteger()
- property test (fast-check): for any valid context, totalPaise >= 0 and `lines` sums EXACTLY to totalPaise

Then the Nest side — apps/api/src/modules/pricing/:
- PricingService gathers the context (market from demand_signals, occupancy from bookings, calendar from a holiday config, settings from platform_settings) and calls the pure engine. The service does I/O; the engine does math. Keep that line clean.
- POST /quotes -> { breakdown, quoteToken, expiresAt }. quoteToken = HMAC-SHA256 over a CANONICAL JSON of { vehicleId, startAt, endAt, totalPaise, depositPaise, expiresAt } using QUOTE_SIGNING_SECRET. TTL 10 minutes.
- QuoteService.verify(token, claims) for Phase 6, using constant-time comparison.

Show the diff.
```

---

## Phase 6 — Bookings, availability, state machine, WS gateway

### Prompt

```
Implement bookings for rent-o-ride.

1. packages/domain/src/availability/:
   - overlaps(a, b): half-open -> a.start < b.end && b.start < a.end. Test touching endpoints explicitly.
   - freeSlots(window, busy[], granularityMinutes): clamp to window, sort, MERGE overlapping, then complement. Test: no busy, fully busy, adjacent blocks that must merge, unsorted input, busy extending past the window.
   - nextAvailableFrom(desiredStart, busy, durationHours): Date | null
   Algorithm in Appendix D.

2. GET /vehicles/:id/availability?from&to returns busy ranges (bookings + blackouts) for the calendar. Return ONLY the ranges — never who booked it or why it's blocked.

3. packages/domain/src/booking/stateMachine.ts — an explicit transition table:
   QUOTED -> PENDING_PAYMENT
   PENDING_PAYMENT -> CONFIRMED | EXPIRED | CANCELLED
   CONFIRMED -> ONGOING | CANCELLED | DISPUTED
   ONGOING -> COMPLETED | DISPUTED
   DISPUTED -> COMPLETED | CANCELLED
   COMPLETED, CANCELLED, EXPIRED terminal.
   Export canTransition(from, to) and assertTransition(from, to) throwing InvalidTransitionError. Unit test the FULL matrix, including that terminal states have no outgoing edges.

4. POST /bookings:
   - requires an Idempotency-Key header (@Idempotent() decorator + Redis-backed interceptor) and a valid unexpired quoteToken
   - re-verifies the HMAC and that the token's vehicleId/startAt/endAt/total match the body
   - RE-COMPUTES the price server-side and asserts it equals the quoted total. If the market moved, return 409 PRICE_CHANGED with the new breakdown — never silently charge a different amount.
   - checks platform_settings.booking_enabled
   - runs ONE transaction: insert booking (PENDING_PAYMENT, expires_at = now + 15min, quote_snapshot = the full breakdown) -> create the Razorpay order -> insert the payments row -> commit
   - a PrismaExceptionFilter maps Postgres 23P01 to 409 SLOT_TAKEN, including the next available slot from nextAvailableFrom()
   - a duplicate Idempotency-Key returns the ORIGINAL booking with 200, not a new one
   Note the tradeoff explicitly in a comment: the Razorpay order call is a network call inside a DB transaction. Keep the transaction timeout at 10s; if the order call fails the transaction rolls back so no orphan booking holds the slot. Document the alternative (create booking, then order, with a compensating job) and why we chose this.

5. BullMQ instead of pg_cron:
   - repeatable job every minute: PENDING_PAYMENT bookings with expires_at < now() -> EXPIRED, and cancel the Razorpay order. This frees held slots.
   - job config: attempts 5, exponential backoff, removeOnComplete 1000, a dedicated dead-letter queue with an alert log on entry
   - bull-board mounted at /admin/queues behind the admin guard

6. WebSocket gateway in apps/api/src/modules/events/:
   - namespace /events, JWT-authenticated on handshake
   - rooms: `vehicle:{id}`, `user:{id}`
   - emit booking.confirmed, booking.cancelled, vehicle.availability_changed from the bookings service AFTER the transaction commits — never inside it. An event emitted for a rolled-back transaction is a real bug; use an outbox row or an afterCommit hook.

7. apps/web booking flow: a date-time range picker reading the availability endpoint and disabling unavailable ranges, a live breakdown panel re-quoting on change (debounced), and a "quote expires in 9:58" countdown that re-quotes on expiry.

Show the diff.
```

---

## Phase 7 — Payments module (Razorpay, webhooks, refunds)

Correctness here matters more than anything else in the project.

### Prompt

```
Implement payments for rent-o-ride.

1. apps/api/src/modules/payments/razorpay.adapter.ts — the ONLY file importing the razorpay SDK:
   createOrder({ amountPaise, receipt, notes })
   fetchPayment(paymentId)
   capturePayment(paymentId, amountPaise)
   createRefund({ paymentId, amountPaise, speed, notes, idempotencyKey })
   Wrap every call with a timeout and typed errors. Never import this from packages/domain.

2. Client checkout in apps/web: Razorpay Checkout with the order_id. On the success callback, DO NOT mark anything paid — redirect to /bookings/:id/processing which listens on the WebSocket for booking.confirmed (with a polling fallback). Comment that the client callback is untrusted.

3. POST /webhooks/razorpay:
   - @Public() route, validated by HMAC not JWT
   - read the RAW body buffer (registered in main.ts for /webhooks/* only) and verify HMAC-SHA256 against RAZORPAY_WEBHOOK_SECRET using crypto.timingSafeEqual. 400 on mismatch, logged at warn as a security event.
   - idempotency: INSERT into webhook_events (provider, event_id) FIRST. On unique violation return 200 immediately — already processed.
   - handle payment.authorized, payment.captured, payment.failed, refund.processed, refund.failed
   - on captured: ONE transaction -> payments to CAPTURED, booking PENDING_PAYMENT -> CONFIRMED via assertTransition, audit_log row; emit the WS event AFTER commit
   - on failed: booking -> CANCELLED; the slot frees automatically via the partial exclusion constraint
   - out-of-order delivery: guard EVERY update with the state machine. A captured event arriving after a manual cancellation must not resurrect the booking — log the conflict, return 200.
   - return 200 for events you understand but ignore, so Razorpay stops retrying
   - do the heavy work in a BullMQ job and return 200 fast so a slow handler doesn't trigger provider retries. The dedupe insert stays synchronous.

4. Cancellation. packages/domain/src/booking/cancellation.ts, pure:
   computeRefund({ now, startAt, totalPaise, depositPaise, tiers, initiatedBy }) -> { refundPaise, retainedPaise, tierLabel }
   Tier table in Appendix B. The deposit is ALWAYS refunded in full. Owner-initiated = 100% refund + deposit regardless of timing, plus an owner reliability penalty.
   Unit test every boundary EXACTLY: h = 48.0, 47.99, 24.0, 6.0, 0, -1. And test the renter-vs-owner asymmetry.

   [paste Appendix B]

5. POST /bookings/:id/cancel: assertTransition, compute refund, call Razorpay, insert refunds, set CANCELLED, emit WS. Add an e2e test proving the slot is immediately re-bookable after cancellation.

6. Reconciliation job (BullMQ, daily): for every payment in CREATED or AUTHORIZED older than 24h, fetch the real state from Razorpay and correct our record. Log every discrepancy to audit_log at error level. No production payment system runs without this — say so in the comment.

7. Tests: webhook replay (same event_id twice -> exactly one state change), signature tampering, out-of-order capture-after-cancel, and a full happy path through supertest with the Razorpay adapter mocked.

Show the diff.
```

---

## Phase 8 — Trips: pickup, return, late fees, deposit

### Prompt

```
Implement the trip lifecycle in apps/api/src/modules/trips/.

1. POST /bookings/:id/pickup — requires >=4 photos in a PRIVATE "trip-photos" bucket (front/back/left/right) plus the starting odometer. Sets trips.picked_up_at, booking CONFIRMED -> ONGOING, vehicle -> RENTED. Reject a pickup more than 2 hours before start_at.

2. POST /bookings/:id/return — requires return photos + ending odometer. Then compute via PURE domain functions:
   - late fee: packages/domain/src/booking/lateFee.ts per Appendix C (30-min grace, 1.5x hourly, capped at 2x daily per late day)
   - km overage: includedKm = includedKmPerDay * billedDays; overageKm = max(0, endOdo - startOdo - includedKm); charge = overageKm * perExtraKmPaise
   - deposit settlement: settle = depositPaise - lateFee - kmOverage - damageCharge
       settle > 0 -> refund that amount
       settle < 0 -> raise an ADDITIONAL CHARGE REQUEST for abs(settle); never silently capture beyond the authorized amount
   Store each component on the trips row; write the settlement as a refunds row and/or a new payment.

   [paste Appendix C]

   Unit test: exactly-on-time return, 20-minute grace (no fee), 3 hours late, late fee hitting the daily cap, endOdo < startOdo (validation error, not a negative charge), settlement exactly equal to the deposit.

3. Booking -> COMPLETED, vehicle -> AVAILABLE, and enqueue a review-prompt job for both parties.

4. Disputes: POST /bookings/:id/dispute with photos and a description moves the booking to DISPUTED. The deposit is HELD, not refunded, while disputed. Admin resolves with an amount; the resolution writes audit_log and adjusts the settlement.

5. apps/web: a guided pickup/return wizard with a photo checklist, and an odometer input that asks "are you sure?" on an implausible delta (>1000 km/day car, >400 bike, >150 bicycle). A settlement receipt showing every deduction line by line.

Show the diff.
```

---

## Phase 9 — Reviews, reputation, recommendations

### Prompt

```
Implement reputation and recommendations for rent-o-ride.

1. ReviewsModule: only a user with a COMPLETED booking may review that vehicle and that owner. One review per booking per direction, within 14 days of completion. Enforce in the service AND the RLS policy (defense in depth). 1-5 stars + optional body.

2. packages/domain/src/reputation/bayesian.ts — pure:

   WR = (v / (v + m)) * R + (m / (v + m)) * C

   R = subject mean, v = count, m = confidence prior (default 5), C = platform mean.
   Plus time decay: w_i = exp(-ln(2) * ageDays / 180); R = Σ(w_i·r_i)/Σ(w_i); v_eff = Σ(w_i); use v_eff in the formula, NOT the raw count.

   [paste Appendix F]

   Unit test: one 5-star review scores BELOW a 4.6-with-200-reviews subject; zero reviews returns exactly C; a two-year-old 5-star contributes far less than last week's; v_eff decays for an inactive owner so they regress toward C.

3. Materialize it: a vehicle_ratings table refreshed by a BullMQ repeatable job every 15 minutes. Search reads the materialized column — never compute Bayesian ratings inside the search query. Log the refresh duration.

4. Owner reliability score (separate from stars, per Appendix F): cancellations, late handovers and lost disputes each penalize it. Expose as a badge; use as a tiebreaker in the Phase 4 ranking.

5. packages/domain/src/ranking/recommend.ts — content-based ONLY, no collaborative filtering (cold start; say so in the report).
   Build a user profile vector from completed bookings: one-hot vehicle type weighted by count, normalized mean daily price, normalized mean duration, preferred city one-hot.
   Score candidates by cosine similarity: cos(a,b) = (a·b)/(||a||·||b||).
   Zero-history users fall back to the city's top-ranked vehicles by the Phase 4 score.
   Unit test: a bikes-only user gets bikes first; cos of identical vectors === 1; zero-history hits the popularity fallback; a zero vector does not divide by zero.

6. apps/web: a "Recommended for you" rail on the renter dashboard, "similar vehicles" on the detail page.

Show the diff.
```

---

## Phase 10 — Analytics module & dashboards

### Prompt

```
Implement analytics for rent-o-ride.

1. apps/api/src/modules/analytics/ with every query as a named, commented repository method. Implement these metrics exactly:

   Utilization      U = booked_vehicle_hours / available_vehicle_hours
                        (available EXCLUDES maintenance and blackout time)
   ADR                = rental_revenue_paise / billed_vehicle_days
   RevPAV             = rental_revenue_paise / available_vehicle_days
   Conversion         = confirmed_bookings / quote_requests
   Cancellation rate  = cancelled / (confirmed + cancelled)
   Repeat-renter rate = renters_with_>=2_completed / renters_with_>=1_completed
   Avg trip length hours
   Revenue by vehicle type / city / month
   Owner net payout   = rental_revenue - commission(commission_bps) - refunds

   Comment that RevPAV is the metric that actually matters: high ADR with low utilization is worse than moderate ADR with high utilization.

2. A daily_metrics rollup (date, city, vehicle_type, bookings, revenue_paise, booked_hours, available_hours) populated by a nightly BullMQ job. Dashboards read the rollup, not raw tables. The job must be idempotent — re-running it for a date overwrites, never duplicates (upsert on the composite key).

3. GET /analytics/owner (OWNER, scoped to their vehicles) and GET /analytics/platform (ADMIN). An owner must never be able to query another owner's numbers — test this.

4. apps/web owner dashboard: stat cards (month revenue, utilization %, upcoming pickups, avg rating), a revenue bar chart by month, a per-vehicle utilization gauge, a bookings table with filters, and a payout summary (gross, commission, refunds, net).

5. apps/web renter dashboard: upcoming trips with countdown, past trips with receipts, total spent, review prompts, the recommendations rail.

6. Charts with Recharts. Every chart needs a title, axis labels with units (₹ / hours / %), and a sensible empty state.

Show the diff.
```

---

## Phase 11 — Admin module, KYC review, risk scoring

### Prompt

```
Implement the admin and risk modules for rent-o-ride.

1. AdminModule, every route @Roles('ADMIN'):
   - KYC queue: list pending, view a document via a 60-second signed URL, approve/reject with a reason. Approval sets users.kyc_status=VERIFIED and, for owners, owner_profiles.is_verified=true.
   - Vehicle moderation: DRAFT -> AVAILABLE.
   - Dispute resolution: both parties' photos, set a settlement amount, resolve.
   - Risk flag review queue.
   - Read-only audit_log viewer with entity filters.
   - Platform settings: toggle booking_enabled, surge_enabled, max_surge_multiplier. This is the kill switch — an admin disables surge globally in one click. Worth a line in the report as operational control.

2. packages/domain/src/risk/velocity.ts — RULE-BASED only, no ML. Each rule an independently unit-tested pure function over a facts object:

   R1  >3 bookings created in 1 hour by the same user             weight 25
   R2  >2 distinct accounts sharing one device fingerprint         weight 40
   R3  first-ever booking with value > 3x the platform median      weight 20
   R4  >2 payment failures in 10 minutes                            weight 30
   R5  KYC name similarity to account name < 0.7 (Jaro-Winkler)     weight 35
   R6  booking starts within 30 min of creation AND KYC unverified  weight 15
   R7  >5 cancellations by this user in 30 days                     weight 20

   score = Σ triggered weights, capped at 100
   >= 60 -> block, manual review required
   30-59 -> allow but flag, require verified KYC before pickup
   < 30  -> allow

   The facts-gathering query lives in apps/api (I/O); scoring is pure. Unit test every threshold boundary and the cap.

3. Insert a risk_flags row per TRIGGERED RULE with its weight, so an admin sees WHY something was flagged, not just a number.

4. Wire the risk check into POST /bookings as an interceptor running before the transaction. A blocked booking returns 403 with a support reference — never the rule names (don't teach an attacker your rules). Log full detail server-side.

Show the diff.
```

---

## Phase 12 — Hardening, observability, deploy

### Prompt

```
Production-harden rent-o-ride.

1. Security:
   - Global rate limiting with @nestjs/throttler + Redis storage. Tighter per-route limits on /quotes, /bookings, OTP.
   - @fastify/helmet: CSP (no unsafe-inline), HSTS, X-Frame-Options, Referrer-Policy.
   - CORS restricted to WEB_ORIGIN with credentials, no wildcard.
   - Zod validation on EVERY controller input including webhooks.
   - CI grep: SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_SECRET, QUOTE_SIGNING_SECRET must appear nowhere in apps/web or packages/*.
   - CI check: no controller imports PrismaService directly.
   - CI check: PRISMA_ADMIN (RLS-bypassing) is injected in at most the webhook, jobs and admin modules. Fail if it appears elsewhere.
   - Verify every private-storage read goes through a signed short-TTL URL.

2. Observability:
   - nestjs-pino structured JSON logging with x-request-id propagated through every layer INCLUDING BullMQ job context. REDACT phone numbers, full payment payloads, KYC storage paths.
   - Sentry with the pricing engine, booking transaction and webhook handler as tagged transactions.
   - @nestjs/terminus: GET /health (DB + Redis), GET /health/deep (+ Razorpay reachability).
   - Alert-worthy log lines: webhook signature failure, reconciliation discrepancy, a spike in 23P01 rate, risk score >= 60, BullMQ dead-letter entry, pricing guardrail clamp firing frequently.
   - Prometheus metrics: booking success/failure counts, quote latency, search latency, queue depth.

3. Testing:
   - Jest e2e (supertest) for the full happy path: search -> quote -> book -> mocked webhook capture -> confirmed -> pickup -> return -> settlement -> review.
   - A CONCURRENCY e2e: two simultaneous POST /bookings for the same slot; assert exactly one 201 and one 409 SLOT_TAKEN with a suggested next slot.
   - Playwright browser e2e for the booking funnel against a seeded DB.
   - Snapshot tests on the pricing engine so a formula regression fails CI.
   - Testcontainers (or CI service containers) for a REAL Postgres+PostGIS in e2e. Do NOT mock the database for the exclusion-constraint tests — the whole point is that Postgres enforces it.

4. Performance:
   - EXPLAIN ANALYZE for search, the availability check, and each dashboard query; paste the plans into docs/performance.md.
   - Add composite indexes based on the ACTUAL plans, not guesses.
   - Size the Prisma connection pool for the deploy target. If using Supabase's pooler in transaction mode, note that prepared statements conflict with it and document the required setting (pgbouncer=true / statement_cache_size=0).
   - next/image for vehicle photos; RSC for the search shell.

5. Deploy:
   - apps/web -> Vercel. apps/api -> Railway (multi-stage Dockerfile, non-root user, healthcheck). Redis + Postgres as Railway/Supabase services.
   - A SEPARATE worker deployment for BullMQ processors so a long job can't block HTTP request handling. Same image, different entrypoint.
   - Migrations: `prisma migrate deploy` as a release command in CI on main. NEVER `db push` against production.
   - Separate Razorpay test/live keys per environment; webhook URL registered per environment.
   - docs/RUNBOOK.md: replay a failed webhook, manual refund, disable surge, take a vehicle offline, drain the queue, respond to a reconciliation discrepancy, rotate QUOTE_SIGNING_SECRET without invalidating live quotes.
   - README: setup, architecture diagram, and a table listing every algorithm implemented with its file path.

Show the diff.
```

---

# Appendix A — Pricing math

Complete specification. Implement literally.

## A.1 Duration and slab selection

```
rawHours    = (endAt - startAt) / 3_600_000
hours       = ceil(rawHours)                 # partial hours round up
billedHours = max(hours, vehicle.minHours)
days        = ceil(billedHours / 24)
weeks       = ceil(days / 7)
months      = ceil(days / 30)
```

Candidate fares (only for slabs the rate card defines):

```
hourlyFare  = hourlyPaise  * billedHours
dailyFare   = dailyPaise   * days
weeklyFare  = weeklyPaise  * weeks
monthlyFare = monthlyPaise * months

baseFare = min(defined candidates)
slabUsed = argmin
```

Taking the **minimum** is deliberate: the customer automatically gets the cheapest correct slab. It prevents the classic bug where a 25-hour booking costs more than a 3-day one.

Enforced at rate-card save time: `daily < hourly*24`, `weekly < daily*7`, `monthly < weekly*4`.

## A.2 Surge multiplier (demand / supply)

```
S = market.availableVehicles     # same city + type, available in the window
D = market.activeRequests        # quote requests in the last 15 min, same city + type

if S == 0 or D == 0:  ratio = 1
else:                 ratio = D / S

surgeRaw = clamp(1 + K_SURGE * (ratio - 1), 1.0, MAX_SURGE)
```

`K_SURGE = 0.75`, `MAX_SURGE = 1.8` (read from `platform_settings`, not hardcoded):

| D/S | surgeRaw |
|---|---|
| 0.5 | 1.00 (floored — surge never discounts; other modifiers do that) |
| 1.0 | 1.00 |
| 1.5 | 1.375 |
| 2.0 | 1.75 |
| 3.0+ | 1.80 (capped) |

**EMA smoothing** — stops the price flickering between page loads:

```
surge = previousSurge == null
          ? surgeRaw
          : ALPHA * surgeRaw + (1 - ALPHA) * previousSurge     # ALPHA = 0.3
surge = round(surge, 3)
```

Bicycles: `surge = 1.0` always. Surging a ₹40/day bicycle is user-hostile and indefensible in a viva.
Kill switch: `settings.surgeEnabled === false` → `surge = 1.0`.

## A.3 Occupancy multiplier (committed inventory)

```
occupancy = bookedVehicleHours / availableVehicleHours   # same city + type, requested window
```

| occupancy | multiplier | reason |
|---|---|---|
| < 0.50 | 0.90 | fleet idle — stimulate demand |
| 0.50–0.75 | 1.00 | healthy |
| 0.75–0.90 | 1.10 | tight |
| ≥ 0.90 | 1.25 | scarce — protect availability |

Surge and occupancy are different signals: surge is short-term *request* pressure, occupancy is committed *inventory* pressure. Both apply.

## A.4 Lead-time factor

```
leadHours = (startAt - now) / 3_600_000
```

| leadHours | factor | reason |
|---|---|---|
| ≥ 168 (7d) | 1.00 | standard |
| 72–168 | 0.92 | early-bird |
| 24–72 | 0.88 | advance discount |
| 6–24 | 1.00 | standard |
| < 6 | 1.12 | last-minute premium |

The dip in the middle is intentional: reward planning, charge for urgency.

## A.5 Seasonal / weekend

Use the *fraction* of the booking on weekends/holidays, not a flat flag:

```
seasonal = 1 + (0.15 * weekendShare) + (0.25 * holidayShare)
seasonal *= calendar.seasonMultiplier          # per-month config, e.g. Dec 1.10, Jul 0.95
seasonal  = clamp(seasonal, 0.85, 1.50)
```

## A.6 Long-duration discount

Applied **only** when the chosen slab is HOURLY or DAILY — weekly/monthly slabs already encode the discount, so applying both double-discounts:

| days | multiplier |
|---|---|
| 1–2 | 1.00 |
| 3–6 | 0.95 |
| 7–13 | 0.90 |
| ≥ 14 | 0.85 |

## A.7 Composition and guardrails

```
adjusted = baseFare * surge * occupancy * leadTime * seasonal * longDuration

adjusted = clamp(adjusted, baseFare * FLOOR_RATIO, baseFare * CEIL_RATIO)
           # FLOOR_RATIO = 0.70, CEIL_RATIO = 2.00
```

**The single most important safety line in the engine.** Without it, four multipliers compound: `1.8 × 1.25 × 1.12 × 1.5 = 3.78x`. The clamp catches it at 2.0x. Record which bound fired in `clampApplied` and log it — frequent clamping means your multipliers need retuning.

## A.8 Discounts, add-ons, tax

```
discount = coupon.kind == 'PERCENT'
             ? min(round(adjusted * coupon.value / 100), coupon.maxDiscountPaise ?? Infinity)
             : min(coupon.value, adjusted)
discount = min(discount, adjusted)             # fare never goes negative

addOns   = deliveryPaise + helmetPaise + insurancePaise
taxable  = adjusted - discount + addOns
gst      = round(taxable * settings.gstRateBps / 10_000)
total    = taxable + gst

deposit    = vehicle.depositPaise              # refundable, NOT taxable
payableNow = total + deposit
```

The security deposit is **never** in the taxable base — it's a refundable security amount, not consideration for a service. Getting this wrong is a real compliance bug. Keep the GST rate in `platform_settings` and confirm the current rate for vehicle rental services before you put a number in your report.

## A.9 Rounding

Every intermediate multiplication rounds half-up to the nearest paise **immediately**:

```
mulPaise(p, m) = Math.round(p * m)     # p integer in, integer out
```

Never carry a float through two multiplications. Chain:

```
x = mulPaise(baseFare, surge)
x = mulPaise(x, occupancy)
x = mulPaise(x, leadTime)
x = mulPaise(x, seasonal)
x = mulPaise(x, longDuration)
```

Assert `Number.isInteger()` on every returned amount in the tests.

## A.10 Worked example (put this exact case in your tests)

Honda Activa scooter, Noida. Sat 20 Sep 10:00 → Mon 22 Sep 10:00 IST. Quote requested Fri 19 Sep 08:00.

```
Rate card:  hourly ₹40 (4000p), daily ₹500 (50000p), weekly ₹2,800 (280000p)
minHours:   4
deposit:    ₹1,000 (100000p)

Duration
  rawHours = 48, hours = 48, billedHours = 48, days = 2, weeks = 1

Candidates
  hourly = 4000 * 48  = 192000p
  daily  = 50000 * 2  = 100000p   <- min
  weekly = 280000 * 1 = 280000p
  baseFare = 100000p, slabUsed = DAILY

Modifiers
  market: D = 18, S = 12 -> ratio = 1.5
  surgeRaw = 1 + 0.75*(1.5-1) = 1.375
  previousSurge = 1.30 -> surge = 0.3*1.375 + 0.7*1.30 = 1.3225 -> 1.322
  occupancy = 0.81 -> 1.10
  leadHours = 26   -> 0.88
  weekendShare = 1.0 -> seasonal = 1 + 0.15 = 1.15
  longDuration (2 days) -> 1.00

Composition
  x = mulPaise(100000, 1.322) = 132200
  x = mulPaise(132200, 1.10)  = 145420
  x = mulPaise(145420, 0.88)  = 127970
  x = mulPaise(127970, 1.15)  = 147166
  x = mulPaise(147166, 1.00)  = 147166

Guardrail
  floor = 70000, ceil = 200000 -> inside. adjusted = 147166p (₹1,471.66), clampApplied = null

Tax and deposit
  discount = 0, addOns = 0 (2 helmets included)
  taxable  = 147166p
  gst      = round(147166 * gstRateBps / 10000)
  total    = 147166 + gst
  deposit  = 100000p
  payableNow = total + 100000p

Included km = 150/day * 2 = 300 km; overage ₹6/km (600p) charged at return
```

Assert `adjustedFarePaise === 147166` exactly. If a refactor changes it, CI fails — exactly what you want from a pricing engine.

---

# Appendix B — Cancellation refund tiers

```
h = (startAt - now) / 3_600_000      # hours until pickup
```

| h | rental refunded | retained | label |
|---|---|---|---|
| ≥ 48 | 100% | 0% | Free cancellation |
| 24–48 | 75% | 25% | Standard |
| 6–24 | 50% | 50% | Late |
| 0–6 | 25% | 75% | Very late |
| after start (no-show) | 0% | 100% | No-show |

```
refund = mulPaise(totalPaise, tierRatio) + depositPaise     # deposit always returned in full
```

**Owner-initiated cancellation: 100% refund + deposit, always**, plus a penalty against the owner's reliability score. Without this asymmetry, owners cancel confirmed bookings whenever surge rises, which destroys renter trust. Test the asymmetry explicitly — it's a good viva talking point.

Test boundaries exactly: `h = 48.0`, `47.99`, `24.0`, `6.0`, `0`, `-1`.

---

# Appendix C — Late return fee

```
graceMinutes = 30
lateMinutes  = max(0, (returnedAt - endAt) / 60_000 - graceMinutes)
lateHours    = ceil(lateMinutes / 60)

perHourLate  = mulPaise(rateCard.hourlyPaise, LATE_MULTIPLIER)    # LATE_MULTIPLIER = 1.5
lateFee      = perHourLate * lateHours

lateDays     = ceil(lateHours / 24)
lateFee      = min(lateFee, mulPaise(rateCard.dailyPaise, 2) * lateDays)   # daily cap
```

The cap matters. Uncapped, a renter 3 days late on a ₹500/day scooter owes `1.5 × 40 × 72 = ₹4,320` — punitive, unenforceable, and it becomes a dispute. Capped: `2 × 500 × 3 = ₹3,000`.

If `lateFee + kmOverage + damage > deposit`, the excess becomes an **additional charge request**, not a silent extra capture. Never charge beyond the authorized amount without fresh consent.

---

# Appendix D — Availability math

## Interval overlap

Two half-open intervals `[s₁, e₁)` and `[s₂, e₂)` overlap iff:

```
s₁ < e₂  AND  s₂ < e₁
```

Both conditions, strict inequalities. This is exactly what Postgres's `&&` on `tstzrange` does, and why touching endpoints (one ending 17:00, another starting 17:00) correctly do **not** conflict.

The common bug is `s₁ <= e₂ AND s₂ <= e₁`, which blocks back-to-back bookings and silently costs revenue.

## Free-slot computation

Given window `W = [ws, we)` and busy intervals `B`:

```
1. Filter B to those overlapping W
2. Clamp each to W
3. Sort by start
4. Merge: if b[i].start <= merged.last.end -> merged.last.end = max(end, b[i].end)
5. Complement:
     cursor = ws
     for m in merged: if m.start > cursor -> emit [cursor, m.start); cursor = max(cursor, m.end)
     if cursor < we -> emit [cursor, we)
6. Drop gaps shorter than the requested duration
```

O(n log n) from the sort, O(n) after. **Merging before complementing** is the step people skip, and skipping it produces negative-length or duplicate gaps.

## Why the database, not the application

The naive application check:

```sql
SELECT 1 FROM bookings WHERE vehicle_id = $1 AND period && $2 AND status IN (...);
-- if no rows, INSERT
```

Two concurrent requests both run the SELECT, both see nothing, both INSERT. Both succeed. Same vehicle, same slot, two bookings. Under default `READ COMMITTED` this is a genuine race, and it's the single most common bug in student booking projects.

`EXCLUDE USING gist` makes the second INSERT fail with SQLSTATE `23P01` at the storage layer, atomically, with zero application coordination. Catch it in a Nest exception filter, return 409.

The alternatives, for your report: `SERIALIZABLE` isolation (correct, but forces retry logic everywhere and hurts throughput) or `SELECT ... FOR UPDATE` on the vehicle row (correct, but serializes all bookings for a vehicle and doesn't compose with blackouts). The exclusion constraint beats both, and it keeps working even if something writes to the DB outside your API.

---

# Appendix E — Geospatial math

## Haversine (the fallback path)

```
φ₁, φ₂ = lat₁, lat₂ in radians
Δφ = φ₂ - φ₁
Δλ = (lng₂ - lng₁) in radians

a = sin²(Δφ/2) + cos(φ₁)·cos(φ₂)·sin²(Δλ/2)
d = 2R · asin(√a)            R = 6,371,008 m
```

Use `asin(√a)`, not the spherical law of cosines — the latter loses precision under ~1 km.

```sql
2 * 6371008 * asin(sqrt(
  power(sin(radians(:lat - lat) / 2), 2) +
  cos(radians(lat)) * cos(radians(:lat)) *
  power(sin(radians(:lng - lng) / 2), 2)
))
```

This cannot use an index. It scans. Fine for a seeded demo, wrong for production — which is the argument for PostGIS.

## Bounding-box pre-filter

```
Δlat = radiusKm / 111.32
Δlng = radiusKm / (111.32 · cos(lat))

WHERE lat BETWEEN :lat - Δlat AND :lat + Δlat
  AND lng BETWEEN :lng - Δlng AND :lng + Δlng
```

Then exact Haversine on the survivors. The `cos(lat)` term is essential — a degree of longitude is ~111 km at the equator but ~98 km at Delhi's 28.6°N. Omitting it makes your radius wrong by >10% in North India.

## PostGIS (the real path)

```sql
SELECT id, ST_Distance(location, :point::geography) AS distance_m
FROM vehicles
WHERE status = 'AVAILABLE'
  AND ST_DWithin(location, :point::geography, :radius_m)
ORDER BY location <-> :point::geography
LIMIT 20;
```

- `ST_DWithin` is index-assisted on the GIST index — it's the filter.
- `<->` is the KNN operator; with `ORDER BY ... LIMIT k` Postgres returns neighbours in distance order without computing distance for every row.
- `geography` gives true spheroid distance in metres. `geometry` with SRID 4326 gives degrees, which is meaningless as a distance. Use `geography`.

`EXPLAIN ANALYZE` must show *Index Scan using vehicles_location_gix*. A Seq Scan means your `<->` operand types don't match the index.

---

# Appendix F — Reputation math

## Bayesian weighted rating

```
WR = (v / (v + m)) · R + (m / (v + m)) · C
```

- `R` = subject's mean rating
- `v` = number of ratings
- `m` = confidence prior (5 at launch; raise as volume grows)
- `C` = platform-wide mean

Intuition: every subject starts pre-loaded with `m` imaginary ratings at the platform average. One 5-star review on a new vehicle gives `(1/6)·5 + (5/6)·4.2 = 4.33`, correctly ranking below an established 4.6-with-200. A plain mean puts the new one first — the classic "one review, perfect score, top of search" failure.

## Time decay

```
w_i   = exp(-ln(2) · ageDays / halfLifeDays)      halfLifeDays = 180
R     = Σ(w_i · r_i) / Σ(w_i)
v_eff = Σ(w_i)
WR    = (v_eff / (v_eff + m)) · R + (m / (v_eff + m)) · C
```

Today's review weighs 1.0, six months ago 0.5, a year ago 0.25. Using `v_eff` instead of the raw count is the key detail: an owner with 50 reviews all from two years ago regresses toward the platform mean, because you no longer have current evidence about them.

## Owner reliability score

Separate from stars — cancellations hurt renters more than a mediocre car does:

```
reliability = 100
  - min(45, 15 · (ownerCancellations / confirmedBookings) · 100)
  - min(30, 10 · (lateHandovers / completedTrips) · 100)
  - min(40, 20 · (disputesLostByOwner / completedTrips) · 100)
clamped to [0, 100]
```

Surface as a badge; use as a tiebreaker in search ranking.

---

# Appendix G — What is deliberately NOT built

Put this in your report as "Future Work" and say it in the viva. Naming scope boundaries deliberately reads as engineering judgment; being caught without them reads as an oversight.

| Feature | Why out of scope | Production path |
|---|---|---|
| IoT keyless unlock | Needs a telematics unit per vehicle | MQTT broker + per-device certs; API publishes an unlock command, device ACKs |
| Live GPS / geofencing | Same hardware dependency | Device streams position; `ST_Contains` against a geofence polygon; alert on exit |
| ML demand forecasting | Needs months of real booking data | Gradient-boosted regression on (city, type, hour, dow, weather, events) predicting request volume, feeding the surge input instead of the live ratio |
| Collaborative filtering | Cold start — no interaction matrix at launch | Implicit-feedback ALS once there's density; hybrid with the content-based scorer already built |
| Insurance underwriting | Regulated; needs an insurer partnership | Partner API at booking time, per-trip policy issuance |
| Automated damage detection | Needs a labelled dataset | Fine-tuned vision model comparing pickup vs return photos, human-in-the-loop |
| Fleet rebalancing | Operational, not software | Optimization over predicted demand vs fleet position — the vehicle-repositioning problem |

The honest framing: the **software** architecture — pricing engine, availability guarantees, geospatial search, payment correctness, risk scoring, job orchestration — is built to production standards. The **hardware- and data-dependent** layers are stubbed behind clean interfaces so they can be swapped in without touching domain logic. That's defensible, and it's true.

---

# Build order summary

| Phase | Deliverable | Blocks |
|---|---|---|
| 0 | Turborepo, Nest+Fastify booting, dual Prisma clients, money module, lint boundaries | everything |
| 1 | Schema, exclusion constraint, PostGIS, session-var RLS, seed | 2–12 |
| 2 | Auth module, global JwtAuthGuard, RolesGuard, KYC scaffold | 3, 11 |
| 3 | Vehicles module, rate cards, blackouts | 4, 5 |
| 4 | Search module: geo + ranking | 6 |
| 5 | **Pricing engine (pure, tested) + quote signing** | 6, 7 |
| 6 | Bookings, availability, state machine, BullMQ expiry, WS gateway | 7 |
| 7 | **Payments: Razorpay, webhooks, refunds, reconciliation** | 8 |
| 8 | Trips: pickup/return, late fees, deposit settlement | 9, 10 |
| 9 | Reviews, Bayesian reputation, recommendations | 10 |
| 10 | Analytics module, rollups, dashboards | — |
| 11 | Admin, KYC review, risk scoring, kill switch | — |
| 12 | Hardening, observability, deploy (web + api + worker) | ship |

If time runs short, **phases 1, 5, 6 and 7** are what make this production-grade. Trim everything else to a thinner version and list it as future work. Do not trim: the exclusion constraint, the pricing engine tests, webhook-driven payment confirmation, or the session-variable RLS. Those four are the difference between a demo and a system.

---

# What changed moving from Next-only to NestJS

Worth knowing, and worth a paragraph in your report:

1. **Authorization moved from RLS to guards**, with RLS kept as a transaction-scoped backstop via `set_config`. A pooled API role bypasses `auth.uid()` — the single most important consequence, and the one most people miss.
2. **pg_cron → BullMQ + Redis.** Retries, exponential backoff, dead-letter queues, a visible queue board. This is the strongest practical reason to use Nest here.
3. **Supabase Realtime → a Nest WebSocket gateway.** Nest owns every write, so it emits precisely — and only after the transaction commits.
4. **Raw-body handling is now explicit** in `main.ts` for `/webhooks/*` only, since Fastify parses bodies by default and HMAC needs the exact bytes.
5. **A separate worker deployment**, so a long job can't block HTTP handling.
6. **`packages/shared`** gives one Zod schema used by both the Nest DTOs and the web forms — no drift between client and server validation.
7. **Auto-generated OpenAPI at `/docs`** — a free report deliverable you didn't have before.
8. **A new failure mode to watch:** the Razorpay order call sits inside the booking DB transaction. Phase 6 documents the tradeoff and the alternative; don't let that comment get deleted.
