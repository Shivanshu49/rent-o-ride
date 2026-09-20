import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI config. Migrations run over DIRECT_URL, never the pooler:
 * a transaction-mode pooler breaks advisory locks and prepared statements,
 * which migrate depends on.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
    // An explicit shadow database on the same PostGIS container, rather than
    // letting Prisma create one: a shadow DB Prisma creates on a managed
    // Postgres often cannot CREATE EXTENSION postgis, and `migrate dev` then
    // fails on a migration that is perfectly valid against the real database.
    // Created by docker/initdb/01-shadow.sql. Prisma resets its schema on every
    // run; the extensions survive because they live outside the public schema.
    shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
});
