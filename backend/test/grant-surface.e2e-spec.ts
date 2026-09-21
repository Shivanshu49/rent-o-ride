/**
 * The whole write surface app_role has, pinned.
 *
 * `privileged-columns.e2e-spec.ts` proves that specific escalations are
 * refused. It cannot prove the absence of one nobody thought of: a migration in
 * Phase 7 that adds a table, or re-runs `GRANT UPDATE ON ALL TABLES` out of
 * habit, would leave every one of those cases green while reopening the class.
 *
 * So this file asserts the surface EXHAUSTIVELY and in both directions. Every
 * table in `public` must appear in EXPECTED, and every grant app_role actually
 * holds must match. A new table fails here until somebody writes down what may
 * be written to it — which is the review conversation this test exists to force.
 *
 * The headline assertion is the first one: app_role holds ZERO table-level
 * UPDATE. A table-level grant is the thing that silently covers a column added
 * later, so the rule is "name the columns" rather than "name the exceptions".
 */
import { Client, type QueryResultRow } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OWNER_URL = process.env['DIRECT_URL']!;

interface Expectation {
  /** Columns app_role may UPDATE. Empty means no UPDATE of any kind. */
  update: readonly string[];
  /** Whether ANY insert grant exists. The column lists live in the migrations;
   *  what matters here is that a table nobody may write has none. */
  insert: boolean;
  /**
   * DELETE is not a column privilege in Postgres — it removes whole rows, so
   * there is nothing to narrow. It is read from table_privileges rather than
   * column_privileges, which never reports it at all. Deriving it from the
   * column view would silently answer "false" for every table.
   */
  delete: boolean;
  /** Why this surface and not a smaller one. Read this before widening it. */
  why: string;
}

/**
 * The authoritative list. Changing a line here is a security decision and
 * should be as visible in review as the migration that goes with it.
 */
const EXPECTED: Readonly<Record<string, Expectation>> = {
  // ---- identity -----------------------------------------------------------
  users: {
    update: ['full_name', 'phone', 'email'],
    insert: false,
    delete: true,
    why: 'Contact details are yours to change. role, kyc_status and auth_user_id are the privilege itself. The bootstrap INSERT runs on PRISMA_ADMIN because no user context exists yet. DELETE is gated by users_admin_delete.',
  },
  owner_profiles: {
    update: [],
    insert: true,
    delete: false,
    why: 'Applying is an INSERT of user_id and payout_account_ref; is_verified and commission_bps come from the column defaults. There is no self-UPDATE policy, so there is no UPDATE grant either — a grant with no policy behind it reads as allowed and behaves as a silent no-op.',
  },

  // ---- inventory ----------------------------------------------------------
  vehicles: {
    update: [
      'type', 'brand', 'model', 'reg_number', 'year', 'specs', 'images', 'city',
      'location', 'min_hours', 'deposit_paise', 'included_km_per_day',
      'per_extra_km_paise', 'deleted_at',
    ],
    insert: true,
    delete: true,
    why: 'An owner edits and soft-deletes their own listing. status is excluded so an owner cannot un-suspend themselves; DRAFT->AVAILABLE becomes a named method on PrivilegedWritesService in Phase 3.',
  },
  rate_cards: {
    update: ['hourly_paise', 'daily_paise', 'weekly_paise', 'monthly_paise', 'effective_from', 'effective_to'],
    insert: true,
    delete: true,
    why: "The owner's own prices, scoped by rate_cards_owner_write. vehicle_id is excluded so a card cannot be repointed at somebody else's vehicle.",
  },
  blackouts: {
    update: ['start_at', 'end_at', 'reason'],
    insert: true,
    delete: true,
    why: "The owner's own unavailable dates. vehicle_id excluded for the same reason as rate_cards; period is GENERATED and rejects a write with 428C9 regardless.",
  },

  // ---- booking and money --------------------------------------------------
  bookings: {
    update: [],
    insert: true,
    delete: false,
    why: 'Creating a booking is a user action; every transition after that is the state machine, and goes through PrivilegedWritesService with an audit row (Phase 6). A renter who could UPDATE status would mark their own booking COMPLETED; one who could UPDATE total_paise would set their own price.',
  },
  trips: {
    update: [],
    insert: true,
    delete: false,
    why: 'A trip row is created at pickup. late_fee_paise, km_overage_paise and damage_paise are computed at return (Phase 8) and rewriting them is an audited act.',
  },
  payments: {
    update: [],
    insert: false,
    delete: false,
    why: 'Written only by the webhook handler on PRISMA_ADMIN, because a webhook has no user context. Payment state comes from the provider, never from a client.',
  },
  refunds: {
    update: [],
    insert: false,
    delete: false,
    why: 'Same as payments.',
  },
  webhook_events: {
    update: [],
    insert: false,
    delete: false,
    why: 'The idempotency ledger for provider callbacks. Written by the webhook handler on PRISMA_ADMIN; a client that could write it could replay or suppress a payment event.',
  },

  // ---- reputation ---------------------------------------------------------
  reviews: {
    update: [],
    insert: true,
    delete: false,
    why: 'reviews_completed_booking_insert is deliberately strict: author must be you, booking must be COMPLETED. There is no UPDATE policy because editing a review after the fact defeats the point.',
  },
  vehicle_ratings: {
    update: [],
    insert: false,
    delete: false,
    why: 'The Bayesian rating a job recomputes (Appendix F). An owner who could write it would simply be five stars.',
  },

  // ---- compliance ---------------------------------------------------------
  kyc_documents: {
    update: [],
    insert: true,
    delete: false,
    why: 'A document is opened once, on the PENDING column default — status is not in the INSERT grant, so a row cannot assert its own verdict. Review is admin-only.',
  },
  risk_flags: {
    update: [],
    insert: false,
    delete: false,
    why: 'How the platform records that it does not trust somebody. Written by the risk engine on PRISMA_ADMIN; self-service deletion would be quite the feature.',
  },
  audit_log: {
    update: [],
    insert: false,
    delete: false,
    why: 'A log its subjects can write is not a log. Every writer is PRISMA_ADMIN, in the same transaction as the change being recorded.',
  },

  // ---- platform and growth ------------------------------------------------
  platform_settings: {
    update: [],
    insert: false,
    delete: false,
    why: 'The operational kill switch, a single row created by the init migration. Admin operations run on PRISMA_ADMIN; platform_settings_admin_write stays as the second lock. It has no INSERT or DELETE policy, so those grants were dead and are gone.',
  },
  coupons: {
    update: [],
    insert: true,
    delete: true,
    why: 'coupons_admin_write is a FOR ALL admin policy, so INSERT and DELETE stay policy-gated to admins rather than revoked. UPDATE is gone: used_count is incremented inside the booking money transaction on PRISMA_ADMIN (Phase 7), not by a request.',
  },
  referrals: {
    update: [],
    insert: true,
    delete: false,
    why: 'You may create a referral code for yourself. reward_paise is not in the INSERT grant, because referrals_self_insert checks who the referrer is and not what they are paying themselves.',
  },

  // ---- analytics ----------------------------------------------------------
  daily_metrics: {
    update: [],
    insert: true,
    delete: true,
    why: 'Written by job workers on PRISMA_ADMIN. The FOR ALL admin policy gates the request path, so INSERT and DELETE stay policy-scoped rather than revoked; narrow them when Phase 10 lands and the writers are real.',
  },
  demand_signals: {
    update: [],
    insert: true,
    delete: true,
    why: 'Same as daily_metrics.',
  },

  // ---- not ours -----------------------------------------------------------
  spatial_ref_sys: {
    update: [],
    insert: false,
    delete: false,
    why: 'PostGIS metadata, read by every ST_Transform. It has NO row-level security, so the grant is the only control — and corrupting an SRID definition would quietly move every vehicle on the map.',
  },
  _prisma_migrations: {
    update: [],
    insert: false,
    delete: false,
    why: 'Prisma bookkeeping, caught by the init migration\'s ON ALL TABLES wildcard. No RLS either. Nothing in the application reads it, so app_role holds nothing at all.',
  },
};

let owner: Client;

const rowsOf = async <T extends QueryResultRow>(sql: string): Promise<T[]> =>
  (await owner.query<T>(sql)).rows;

beforeAll(async () => {
  owner = new Client({ connectionString: OWNER_URL });
  await owner.connect();
});

afterAll(async () => {
  await owner.end();
});

describe('app_role holds no table-level UPDATE', () => {
  it('on any table in public', async () => {
    // The headline. A table-level grant silently covers every column added
    // later, which is how a column introduced in Phase 9 becomes writable by
    // a Phase 2 policy nobody re-read.
    const held = await rowsOf<{ table_name: string }>(`
      SELECT table_name FROM information_schema.table_privileges
       WHERE grantee = 'app_role' AND table_schema = 'public' AND privilege_type = 'UPDATE'
       ORDER BY table_name`);

    expect(held.map((r) => r.table_name)).toEqual([]);
  });
});

describe('the declared surface is the actual surface', () => {
  it('knows about every table in public', async () => {
    // Both directions. A table missing from EXPECTED fails here rather than
    // being granted whatever ALTER DEFAULT PRIVILEGES happened to say.
    const live = (
      await rowsOf<{ table_name: string }>(`
        SELECT c.relname AS table_name
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
         ORDER BY 1`)
    ).map((r) => r.table_name);

    expect(live.filter((t) => !(t in EXPECTED))).toEqual([]);
    expect(Object.keys(EXPECTED).filter((t) => !live.includes(t))).toEqual([]);
  });

  it.each(Object.entries(EXPECTED))('%s grants exactly what it declares', async (table, expectation) => {
    const byColumn = await rowsOf<{ privilege_type: string; column_name: string }>(`
      SELECT privilege_type, column_name
        FROM information_schema.column_privileges
       WHERE grantee = 'app_role' AND table_schema = 'public' AND table_name = '${table}'
         AND privilege_type IN ('UPDATE', 'INSERT')`);

    const columnsFor = (privilege: string): string[] =>
      byColumn.filter((r) => r.privilege_type === privilege).map((r) => r.column_name).sort();

    expect(columnsFor('UPDATE'), expectation.why).toEqual([...expectation.update].sort());
    expect(columnsFor('INSERT').length > 0, expectation.why).toBe(expectation.insert);

    // From table_privileges: column_privileges never reports DELETE, so asking
    // it would answer "nothing may delete" for every table in the schema.
    const canDelete = await rowsOf<{ table_name: string }>(`
      SELECT table_name FROM information_schema.table_privileges
       WHERE grantee = 'app_role' AND table_schema = 'public'
         AND table_name = '${table}' AND privilege_type = 'DELETE'`);

    expect(canDelete.length > 0, expectation.why).toBe(expectation.delete);
  });

  it('names only columns that exist', async () => {
    // A typo in EXPECTED would make the assertion above pass against a column
    // that is not there, which is the same silence a mistyped REVOKE produces.
    const live = await rowsOf<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
    const known = new Set(live.map((r) => `${r.table_name}.${r.column_name}`));

    const unknown = Object.entries(EXPECTED).flatMap(([table, e]) =>
      e.update.filter((column) => !known.has(`${table}.${column}`)).map((c) => `${table}.${c}`),
    );
    expect(unknown).toEqual([]);
  });
});

describe('what a table created later will inherit', () => {
  it('gives app_role SELECT and INSERT, never UPDATE or DELETE', async () => {
    // Phase 1 left ALTER DEFAULT PRIVILEGES granting UPDATE and DELETE on every
    // table created afterwards, which is how this whole class of hole comes
    // back without anybody writing a GRANT. 20260921120000 narrowed it.
    const [acl] = await rowsOf<{ privileges: string }>(`
      SELECT array_to_string(defaclacl, ',') AS privileges
        FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
       WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'`);

    // aclitem letters: a = INSERT, r = SELECT, w = UPDATE, d = DELETE.
    expect(acl!.privileges).toMatch(/\bapp_role=ar\//);
    expect(acl!.privileges).not.toMatch(/\bapp_role=[a-zA-Z]*w/);
    expect(acl!.privileges).not.toMatch(/\bapp_role=[a-zA-Z]*d[^\/]/);
  });

  it('applies to the role migrations actually run as', async () => {
    // ALTER DEFAULT PRIVILEGES without FOR ROLE only affects objects created by
    // the role that ran it. If migrations ever run as a different role, the
    // default silently stops applying — which is safe (app_role gets nothing)
    // but worth knowing rather than discovering.
    const [row] = await rowsOf<{ set_by: string; runs_as: string }>(`
      SELECT pg_get_userbyid(d.defaclrole) AS set_by, current_user AS runs_as
        FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
       WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'`);

    expect(row!.set_by).toBe(row!.runs_as);
  });

  it('proves it on a table created right now', async () => {
    await owner.query('CREATE TABLE IF NOT EXISTS _grant_probe (id int primary key)');
    try {
      const granted = (
        await rowsOf<{ p: string }>(`
          SELECT privilege_type AS p FROM information_schema.table_privileges
           WHERE grantee = 'app_role' AND table_name = '_grant_probe'`)
      ).map((r) => r.p).sort();

      expect(granted).toEqual(['INSERT', 'SELECT']);
    } finally {
      await owner.query('DROP TABLE IF EXISTS _grant_probe');
    }
  });
});
