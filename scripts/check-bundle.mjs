#!/usr/bin/env node
/**
 * The Supabase anon key must not be in the shipped bundle.
 *
 * `check-secrets.mjs` greps the SOURCE for secret NAMES. This one greps the
 * BUILT OUTPUT for the values and the endpoints, because the two failure modes
 * are different: a source grep never sees a key pulled in through a transitive
 * import, a re-exported config object, or an `import.meta.env` Vite inlined at
 * build time under a name nobody thought to forbid.
 *
 * Why it matters here specifically. The anon key is a credential, not a public
 * identifier. Anything holding it can POST /auth/v1/otp directly — which routes
 * around OtpThrottleGuard, the per-phone limit that is the only thing bounding
 * our SMS bill. A throttle that a client can step past is not a throttle, so
 * "the key is not in the bundle" is a security property and gets a test.
 *
 * Run after `npm run build --workspace=frontend`.
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'frontend/dist';

/** Each pattern is a thing that can only be in the bundle by mistake. */
const FORBIDDEN = [
  {
    label: 'a Supabase anon/service key',
    // Every Supabase legacy key is a JWT, so the header prefix is enough and
    // does not go stale when the project's key rotates.
    pattern: /eyJhbGciOiJIUzI1NiI/,
  },
  {
    label: 'a new-format Supabase key',
    pattern: /\bsb_(publishable|secret)_[A-Za-z0-9_-]{8,}/,
  },
  { label: 'the SUPABASE_ANON_KEY name', pattern: /SUPABASE_ANON_KEY/ },
  { label: 'the SUPABASE_SERVICE_ROLE_KEY name', pattern: /SUPABASE_SERVICE_ROLE_KEY/ },
  {
    // Our own API namespaces auth under /auth/otp and /auth/me, never /auth/v1.
    label: 'a Supabase Auth endpoint',
    pattern: /\/auth\/v1\//,
  },
  { label: 'a Supabase project URL', pattern: /[a-z0-9-]+\.supabase\.(co|in)\b/ },
  { label: 'the @supabase/supabase-js runtime', pattern: /GoTrueClient|@supabase\/gotrue-js/ },
];

/** Source maps are not shipped to users, but they carry the same strings and
 *  are routinely deployed by accident. Scan them too. */
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`  ✗ ${DIST} is missing — run: npm run build --workspace=frontend`);
  process.exit(1);
}

// A build that produced nothing would pass every check below.
const scannable = files.filter((f) => /\.(js|mjs|cjs|css|html|json|map|txt)$/.test(f));
if (scannable.length === 0) {
  console.error(`  ✗ ${DIST} has no scannable output — did the build fail?`);
  process.exit(1);
}

let failures = 0;
for (const file of scannable) {
  const source = readFileSync(file, 'utf8');
  for (const { label, pattern } of FORBIDDEN) {
    if (pattern.test(source)) {
      failures += 1;
      console.error(`  ✗ ${file}\n      contains ${label} — the browser must not hold it (see frontend/src/lib/session.ts)`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} Supabase credential leak(s) in the built bundle.\n`);
  process.exit(1);
}
console.log(`✓ no Supabase credentials in the bundle (${scannable.length} files scanned)`);
