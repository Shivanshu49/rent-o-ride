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

`npm run db:up` works with Docker or rootless Podman — it detects which socket is present.
Postgres listens on **5433** and Redis on **6380** so they never collide with a system
install of either.

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
| 2 | Auth module, global JwtAuthGuard, RolesGuard, KYC scaffold | next |
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
