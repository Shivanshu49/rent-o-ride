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

/** PRISMA_ADMIN bypasses RLS. Only these may inject it. */
const ADMIN_ALLOWED = [/\/modules\/(webhooks|payments|jobs|admin)\//, /\/prisma\//, /\/common\//];

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
