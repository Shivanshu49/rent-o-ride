#!/usr/bin/env node
/**
 * Architectural boundaries, enforced by CI rather than by discipline.
 *
 * These are not style rules. Each one, when broken, produces a specific real
 * failure that is expensive to find later:
 *
 *   - shared/ importing I/O          -> the pricing engine stops being testable
 *                                       without a database, and its formulas
 *                                       start depending on wall-clock time
 *   - frontend/ importing @prisma/client -> database credentials in a browser bundle
 *   - a controller importing Prisma  -> unscoped queries bypass the repository
 *                                       layer, which is where actor scoping lives
 *   - PRISMA_ADMIN outside its three -> RLS bypassed on a user-facing path
 *     allowed modules                   (§0.3 of the build guide)
 *
 * A grep is enough here and needs no plugin, no resolver and no config file.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const IMPORT_RE = /(?:^|\n)\s*(?:import\b[^;]*?from\s*|import\s*|export\b[^;]*?from\s*)['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

/** @type {{name: string, files: string, forbid: (spec: string, file: string) => string | null}[]} */
const RULES = [
  {
    name: 'shared/ is pure: zero I/O, zero framework',
    files: 'shared/src/**/*.ts',
    forbid: (spec) => {
      const banned = [
        '@prisma/client', '@nestjs/', 'next/', '@supabase/', 'ioredis', 'bullmq',
        'razorpay', 'pino', 'fastify', 'socket.io', 'react', 'pg', 'node:fs',
        'node:net', 'node:http', 'node:child_process',
      ];
      const hit = banned.find((b) => spec === b.replace(/\/$/, '') || spec.startsWith(b));
      if (hit) return `imports "${spec}" — domain logic must stay free of I/O and frameworks`;
      if (/(^|\/)(backend|frontend)\//.test(spec)) return `imports "${spec}" — shared/ must not depend on an app`;
      return null;
    },
  },
  {
    name: 'frontend/ never touches the database',
    files: 'frontend/src/**/*.{ts,tsx,js,jsx}',
    forbid: (spec) => {
      if (spec === '@prisma/client' || spec.startsWith('@prisma/')) {
        return `imports "${spec}" — that ships database credentials to a browser`;
      }
      if (/(^|\/)backend\//.test(spec) || spec === '@ror/backend' || spec.startsWith('@ror/backend/')) {
        return `imports "${spec}" — the web app talks to the API over HTTP, never by import`;
      }
      return null;
    },
  },
  {
    name: 'controllers do HTTP, repositories do Prisma',
    files: 'backend/src/**/*.controller.ts',
    forbid: (spec) =>
      spec === '@prisma/client' || /prisma\.(service|tokens)$/.test(spec) || /\/prisma\//.test(spec)
        ? `imports "${spec}" — go through the module's repository, which is where actor scoping lives`
        : null,
  },
];

/**
 * PRISMA_ADMIN bypasses RLS. Only these may inject it, and each is a place
 * where there is genuinely no user context to scope by:
 *
 *   webhooks  — the caller is Razorpay, not a user
 *   payments  — reconciliation runs against the provider, unattended
 *   jobs      — BullMQ workers have no request and no actor
 *   admin     — explicit cross-tenant operations, audit-logged
 *   auth      — user bootstrap runs BEFORE the users row exists, so there is no
 *               app.user_id to set. Scoped instead by the verified token: it
 *               only ever touches the row for that auth_user_id.
 *   privileged— the columns app_role was REVOKEd on in
 *               20260921120000_privileged_columns. Every transition is a named
 *               method that writes audit_log in the same transaction. This is
 *               the escape hatch from those grants, and it is meant to be the
 *               only one — which is why it is one small file and not a mixin.
 *
 * Adding to this list is a security decision. Say why, here, in the diff.
 */
const ADMIN_ALLOWED = [
  /\/modules\/(webhooks|payments|jobs|admin|auth|privileged)\//,
  /\/prisma\//,
  /\/common\//,
];

let failures = 0;
const report = (file, rule, message) => {
  failures += 1;
  console.error(`  ✗ ${file}\n      [${rule}] ${message}`);
};

for (const rule of RULES) {
  for (const file of globSync(rule.files, { exclude: (p) => p.includes('node_modules') || p.includes('/dist/') })) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2];
      if (!spec) continue;
      const problem = rule.forbid(spec, file);
      if (problem) report(file, rule.name, problem);
    }
  }
}

/**
 * fetch() lives in exactly one file.
 *
 * Not a style preference. The token attachment, the single 401 refresh and the
 * mapping of an error body to a typed ApiError all live in api-client.ts; a
 * component that calls fetch() directly silently opts out of all three, and the
 * symptom shows up months later as a page that logs people out at random.
 */
const FETCH_HOME = 'frontend/src/lib/api-client.ts';
const FETCH_CALL = /(?<![\w.$])fetch\s*\(/;

for (const file of globSync('frontend/src/**/*.{ts,tsx}', { exclude: (p) => p.includes('node_modules') })) {
  if (file.replace(/\\/g, '/') === FETCH_HOME) continue;
  if (FETCH_CALL.test(readFileSync(file, 'utf8'))) {
    report(file, 'one fetch', `calls fetch() — go through ${FETCH_HOME}, which attaches the token and maps errors`);
  }
}

for (const file of globSync('backend/src/**/*.ts', { exclude: (p) => p.includes('node_modules') })) {
  if (ADMIN_ALLOWED.some((re) => re.test(`/${file}`))) continue;
  if (/\bPRISMA_ADMIN\b/.test(readFileSync(file, 'utf8'))) {
    report(file, 'PRISMA_ADMIN is RLS-bypassing', 'only the webhook, payments, jobs and admin modules may inject it');
  }
}

if (failures > 0) {
  console.error(`\n${failures} architectural boundary violation(s).\n`);
  process.exit(1);
}
console.log('✓ architectural boundaries hold');
