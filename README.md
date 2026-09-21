# Rent-O-Ride

Multi-vehicle rental platform — car, bike, bicycle, scooter — for Delhi NCR.

Built to the spec in [`RENT-O-RIDE_BUILD_GUIDE.md`](./RENT-O-RIDE_BUILD_GUIDE.md), phase by phase.

```
rent-o-ride/
├─ backend/      NestJS 11 + Fastify. Owns every write, every authorization decision.
├─ frontend/     React 19 + Vite + TypeScript. UI only — no business logic, no database.
├─ shared/       Pure domain logic and shared schemas. Zero I/O, zero framework.
├─ scripts/      Architectural checks that run in CI.
└─ docker/       Local Postgres bootstrap.
```

## Local setup

```bash
# 1. Dependencies (npm workspaces — one install covers all three packages)
npm install

# 2. Postgres 15 + PostGIS and Redis, in containers
npm run db:up

# 2b. Supabase (Auth + Storage). Issues the real ES256 tokens the API verifies,
#     and hosts the private "kyc" bucket. Prints the keys step 3 needs.
npm run supabase:start

# 3. Environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Build the shared package, then apply migrations
npm run build --workspace=shared
npm run db:migrate:dev --workspace=backend

# 5. Run both apps
npm run dev:api    # http://localhost:3000  (docs at /docs)
npm run dev:web    # http://localhost:5173
```

`npm run db:up` and `npm run supabase:start` work with Docker or rootless Podman — they
detect which socket is present. Postgres listens on **5433** and Redis on **6380** so they
never collide with a system install of either; Supabase brings its own Postgres on 54322
and serves Auth and Storage on **54321**.

Copy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from what `supabase:start` prints
into `backend/.env` — and **nowhere else**. `frontend/.env` holds no Supabase configuration
at all; the browser reaches Supabase only through the API. Keep the host as `127.0.0.1`:
GoTrue puts its own external URL in the `iss` claim of every token, and the API checks it.

Sign-in during development uses the fixed codes in `supabase/config.toml` under
`[auth.sms.test_otp]` — `+91 98119 99001` with code `123456` — so nothing depends on an
SMS provider. Those numbers sit outside the range `prisma/seed.ts` gives its demo users on
purpose: the seed invents its own `auth_user_id`s, so signing in on a seeded number would
collide on `users_phone_key` and get a 409 instead of a session.

## Checks

```bash
npm run typecheck   # tsc --noEmit across all three packages
npm run lint        # architectural boundaries, secret leaks, then oxlint
npm test            # unit tests
```

`npm run lint` runs two checks that fail CI and are not style rules:

| Check | What it prevents |
|---|---|
| `scripts/check-boundaries.mjs` | `shared/` importing I/O; `frontend/` importing Prisma; a controller reaching past its repository; `PRISMA_ADMIN` (RLS-bypassing) injected outside the webhook, payments, jobs and admin modules |
| `scripts/check-secrets.mjs` | a server-only secret name appearing in browser or shared code |
| `scripts/check-bundle.mjs` | a Supabase key, auth URL or client ending up in the BUILT bundle, where a source grep cannot see it. Run it with `npm run check:bundle` |

## The two database identities

The API connects as **two separate roles**, exposed as two DI tokens:

- `PRISMA_SCOPED` → `app_role`, a non-superuser without `BYPASSRLS`. Every request
  goes through `runScoped(actor, fn)`, which opens a transaction and sets
  `app.user_id` / `app.user_role` transaction-locally. The RLS policies read those,
  not `auth.uid()` — a pooled API role has no `auth.uid()`, so policies written
  against it would be decorative.
- `PRISMA_ADMIN` → the database owner. RLS bypassed. Only the webhook handler, the
  job workers and admin operations may inject it, and CI enforces that.

Authorization is primarily guards plus repository scoping. RLS is the backstop
that catches the `WHERE` clause someone forgets.

## Build status

| Phase | Deliverable | State |
|---|---|---|
| 0 | Workspaces, Nest+Fastify booting, dual Prisma clients, money module, boundary checks, CI | done |
| 1 | Schema, exclusion constraint, PostGIS, session-var RLS, seed | done |
| 2 | Auth module, global JwtAuthGuard, RolesGuard, KYC scaffold, OTP limit, web API client | done |
| 3–12 | See the build guide | pending |

### What Phase 1 guarantees, and where it is proved

| Guarantee | Enforced by | Test |
|---|---|---|
| No double booking, even under true concurrency | `bookings_no_overlap`, `EXCLUDE USING gist` | two open transactions; the second blocks on the predicate lock, then fails `23P01` |
| Back-to-back rentals are allowed | `'[)'` half-open range | a booking starting exactly when another ends succeeds |
| Cancelling frees the slot instantly | the constraint is PARTIAL on `status` | rebook the same window immediately after cancelling |
| `period` can never drift from the dates | `GENERATED ALWAYS ... STORED` | an INSERT naming `period` fails `428C9` |
| A renter sees only their own bookings | RLS via `app_user_id()` | connected as `app_role`, asserted non-superuser and non-BYPASSRLS first |
| Identity does not leak between pooled requests | `set_config(..., true)` | the setting is gone in the next transaction |
| Distance is metres on the spheroid | `geography(Point,4326)` + GIST | CP to Noida Sector 18 measures ~13 km |

### What Phase 2 guarantees, and where it is proved

| Guarantee | Enforced by | Test |
|---|---|---|
| A route nobody remembered to protect returns 401 | `JwtAuthGuard` as `APP_GUARD` | a controller mounted with **no decorator at all**; 401 anonymous, 200 with a token |
| Only `@Public()` opens a route | the same guard, inverted default | `/__probe/opted-out` serves anonymously; everything else does not |
| A forged or stale token is refused | `jose` `jwtVerify` with iss, aud, exp | tampered signature, expired, wrong audience, wrong issuer, `alg:none` — all 401, and the reason never reaches the client |
| Real Supabase tokens verify against the real JWKS | `createRemoteJWKSet` | full OTP handshake against a live Supabase; ES256, `kid` resolved over HTTP |
| Two simultaneous first requests create one user | `users_auth_user_id_key` + catch-and-re-read | two transactions open at once, the second blocked on the first's uncommitted row, then `23505`; and 8 concurrent bootstraps → 1 row, 0 rejections |
| Two identities never merge on a shared phone | the same unique index, rethrown not swallowed | second `auth_user_id` claiming a taken number is refused |
| No government ID number is stored | nothing to enforce — the field does not exist | schema, migrations, shared schemas and every DTO scanned; the detector is itself tested |
| A KYC read URL expires | Supabase signs a deadline into the URL | a 1-second URL returns the bytes, then 400 |
| Only the owner (or an admin) gets one | ownership check before minting, plus RLS | another user gets 404 — the same answer as an id that does not exist |
| The 6th OTP in an hour is refused | Redis `INCR` + `EXPIRE`, keyed by phone | 429 with `Retry-After`; the budget survives a changed client IP and is not shared by a second number behind one |
| `fetch()` lives in exactly one file | `scripts/check-boundaries.mjs` | CI fails on `fetch(` anywhere in `frontend/src` but `lib/api-client.ts` |
| A user cannot grant themselves privilege | column-level `GRANT`, not a policy or a trigger | as `app_role`, an UPDATE or INSERT touching `users.role`, `users.kyc_status`, `users.auth_user_id`, `owner_profiles.is_verified`, `owner_profiles.commission_bps`, `vehicles.status`, `kyc_documents.status`, `bookings.status`, `bookings.total_paise`, `trips.late_fee_paise`, `referrals.reward_paise` or `audit_log` fails with `42501` — while an ordinary profile edit, listing edit and owner application still succeed |
| A mixed UPDATE cannot smuggle a privileged column past | Postgres checks every column in the SET list | `SET full_name = 'Legit', role = 'ADMIN'` is refused whole; the harmless half does not land either |
| A new table does not inherit a write grant | `ALTER DEFAULT PRIVILEGES ... REVOKE UPDATE, DELETE` | a table created mid-test gives `app_role` only SELECT and INSERT |
| The browser cannot request an OTP behind our back | the anon key is not in the bundle | `check-bundle.mjs` greps the built output for the key, `sb_*` keys, `/auth/v1/` and the supabase-js runtime; send, verify, refresh and sign-out all go through the API |
| Signing out actually revokes | `POST /auth/signout` calls Supabase's logout | after sign-out the stored refresh token is refused |

The Supabase-token suite **skips**, loudly and by name, when nothing is listening on
`SUPABASE_URL`. Everything else needs only Postgres and Redis and runs in CI.

### Migrations

Do **not** run `prisma migrate dev` here. Prisma reads a STORED GENERATED
column's expression as an ordinary DEFAULT and proposes
`ALTER COLUMN period DROP DEFAULT`, which Postgres rejects outright — nothing
can be silently destroyed, but the migration will not apply. Use:

```bash
npm run db:diff --workspace=backend     # incremental DDL, review and save it
npm run db:migrate --workspace=backend  # prisma migrate deploy
npm run db:seed --workspace=backend     # runs as the owner, see the file header
```

## Deviations from the build guide

Each one was a deliberate call, not an oversight:

| Guide says | Built as | Why |
|---|---|---|
| Turborepo + pnpm | npm workspaces, `backend/` `frontend/` `shared/` | Requested folder layout; npm was already present and one `install` covers the repo. No build-graph tool for three packages. |
| Next.js 15 App Router | React 19 + Vite, migrated to strict TS | A working 3,275-line prototype already existed. Rebuilding it to gain RSC was not worth the throw-away. |
| `packages/domain` + `packages/shared` | one `shared/` | Two packages with the same consumers and the same "no I/O" rule. The boundary check enforces the purity either way. |
| NestJS 11 + `@nestjs/schedule` | NestJS 11, schedule dropped | BullMQ repeatable jobs already do cron, with retries and a dead-letter queue. A second scheduler would be a second source of truth. |
| `nestjs-zod` `patchNestJsSwagger()` | `cleanupOpenApiDoc()` | Renamed in nestjs-zod v5. |
| Prisma 6, URLs in `schema.prisma` | Prisma 7, URLs in `prisma.config.ts`, `PrismaPg` adapter | Prisma 7 moved them; the adapter is what makes two separate connections per role clean. |
| Jest e2e + Vitest unit | Vitest for both | One runner, one config. Supertest works unchanged under it. |
| Web calls `supabase.auth.signInWithOtp` directly | web calls `POST /auth/otp`, which proxies to Supabase | Going straight to Supabase skips `OtpThrottleGuard` — and that per-phone limit is the only thing between us and somebody spending the SMS budget. Supabase still delivers the message and still mints the session; the request just passes a turnstile first. The browser holds the session through `supabase.auth.setSession`, exactly as before. |
| `GET /owners/me` behind `@Roles('OWNER','ADMIN')` | no role gate | Applying creates an `owner_profiles` row but does not change `users.role` — an admin does that in Phase 11 — so the role gate made the route unreachable for the people it exists for. The query is scoped to the caller either way, and a non-applicant gets a truthful 404. |
| `ApiErrorCode` defined in the API | defined in `shared/` | Both apps switch on it. One definition means a code the client handles cannot quietly disappear from the server. |
| Browser holds the Supabase anon key | key lives only in the API process | The anon key is a credential, not a public identifier: anything holding it can `POST /auth/v1/otp` directly, which routes around `OtpThrottleGuard` — the per-phone limit that is the only thing bounding the SMS bill. A throttle a client can step past is not a throttle. So send, verify, **refresh** and sign-out all go through our API, `frontend/.env` has no Supabase entries, and `scripts/check-bundle.mjs` fails CI if a key, an `/auth/v1/` URL or the supabase-js runtime reappears in `frontend/dist`. Cost: the API is now on the session path, and Supabase's per-IP auth limits see one address instead of many — which is why `supabase/config.toml` sets project-wide floors. |
| RLS alone decides what a user may write | RLS for rows, column `GRANT`s for columns | RLS has no opinion about columns, so "you may update your own row" also meant "you may set your own `role` to ADMIN". A `GRANT` is the access-control system itself rather than code that has to fire: Postgres refuses with `42501` before planning, for every client including `psql`, and `\dp` prints who may write what. Legitimate transitions moved to `PrivilegedWritesService` — `PRISMA_ADMIN`, one named method each, `audit_log` written in the same transaction. |
