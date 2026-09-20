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
  },
});
