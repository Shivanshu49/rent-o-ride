import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Nest's DI reads design-time type metadata that esbuild does not emit.
// SWC does, so every test run goes through it.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
    globals: true,
    root: './',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
