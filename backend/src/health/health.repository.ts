import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PRISMA_SCOPED } from '../prisma/prisma.tokens';
import type { ScopedPrismaClient } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

/**
 * Exists so the health controller does not import Prisma. That rule has no
 * exceptions — a probe today is a convenient place to "just add one query"
 * tomorrow, and that query will not be actor-scoped.
 *
 * It pings as app_role on purpose: that is the identity real traffic uses, so
 * this catches a revoked grant or an exhausted pool, which a superuser ping
 * would happily miss.
 */
@Injectable()
export class HealthRepository {
  constructor(
    @Inject(PRISMA_SCOPED) private readonly prisma: ScopedPrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async pingDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async pingRedis(): Promise<void> {
    const reply = await this.redis.ping();
    if (reply !== 'PONG') throw new Error(`unexpected reply: ${reply}`);
  }
}
