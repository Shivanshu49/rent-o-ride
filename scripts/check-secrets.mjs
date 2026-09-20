#!/usr/bin/env node
/**
 * Server-only secrets must never appear in code that ships to a browser, or in
 * shared code that both apps import.
 *
 * This greps for the NAMES, not the values, on purpose: a real key would rotate
 * and this check would go stale, but `process.env.SUPABASE_SERVICE_ROLE_KEY`
 * appearing in frontend/ is always wrong, whatever the key happens to be today.
 */
import { readFileSync, globSync } from 'node:fs';

const FORBIDDEN = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'QUOTE_SIGNING_SECRET',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  'DIRECT_URL',
];

const SCOPES = [
  { label: 'frontend', files: 'frontend/src/**/*.{ts,tsx,js,jsx}' },
  { label: 'frontend', files: 'frontend/*.{ts,html}' },
  { label: 'shared', files: 'shared/src/**/*.ts' },
];

let failures = 0;
for (const scope of SCOPES) {
  for (const file of globSync(scope.files, { exclude: (p) => p.includes('node_modules') || p.includes('/dist/') })) {
    const source = readFileSync(file, 'utf8');
    for (const name of FORBIDDEN) {
      if (source.includes(name)) {
        failures += 1;
        console.error(`  ✗ ${file}\n      mentions ${name} — that belongs to the API process only`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} server-only secret reference(s) outside the API.\n`);
  process.exit(1);
}
console.log('✓ no server-only secrets outside the API');
