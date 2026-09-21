import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Nest's DI reads design-time type metadata that esbuild does not emit.
// SWC does, so every test run goes through it.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['test/support/test-env.ts'],
    // The e2e suites share one Postgres, one Redis and one Supabase. Running
    // files in parallel makes the OTP counter and the users table contended
    // between suites, which produces failures that are about the runner and
    // not about the code.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    environment: 'node',
    globals: true,
    root: './',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
