import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { AuthActor } from '../common/types/actor';

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

abstract class BasePrismaClient extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  protected abstract readonly label: string;

  async onModuleInit(): Promise<void> {
    await this.$connect();
    Logger.log(`connected (${this.label})`, 'Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * The request-path client. Connects as app_role — a NON-superuser without
 * BYPASSRLS — so every policy written in the Phase 1 migration actually
 * evaluates.
 *
 * Why this class exists at all: in a Supabase-client app the end user's JWT
 * reaches Postgres and policies read auth.uid(). A NestJS API connects with one
 * pooled role, so auth.uid() is null and every policy is decorative. We
 * reproduce the missing user context with transaction-local session variables
 * and point the policies at those instead (§0.3 of the build guide).
 *
 * Authorization is still primarily guards + repository scoping. This is the
 * backstop that catches the WHERE clause someone forgets.
 */
@Injectable()
export class ScopedPrismaClient extends BasePrismaClient {
  protected override readonly label = 'app_role / RLS enforced';

  constructor(connectionString: string) {
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  /**
   * Run `fn` inside one transaction that Postgres sees as belonging to `actor`.
   *
   * set_config(..., true) is TRANSACTION-local: the third argument is what stops
   * the setting leaking to the next request that borrows this pooled connection.
   * Getting that boolean wrong is a cross-tenant data leak, so it is never a
   * variable — it is literally `true` here and nowhere else.
   */
  async runScoped<T>(actor: AuthActor, fn: (tx: PrismaTx) => Promise<T>, timeoutMs = 10_000): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${actor.id}, true)`;
        await tx.$executeRaw`SELECT set_config('app.user_role', ${actor.role}, true)`;
        return fn(tx);
      },
      { timeout: timeoutMs },
    );
  }

  /** Anonymous reads (public vehicle listings, search). No user id is set, so
   *  only the policies that allow the public see anything. */
  async runAnonymous<T>(fn: (tx: PrismaTx) => Promise<T>, timeoutMs = 10_000): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
        await tx.$executeRaw`SELECT set_config('app.user_role', 'ANON', true)`;
        return fn(tx);
      },
      { timeout: timeoutMs },
    );
  }
}

/**
 * RLS-bypassing client. See PRISMA_ADMIN in prisma.tokens.ts for the short list
 * of modules allowed to inject it.
 */
@Injectable()
export class AdminPrismaClient extends BasePrismaClient {
  protected override readonly label = 'owner / RLS BYPASSED';

  constructor(connectionString: string) {
    super({ adapter: new PrismaPg({ connectionString }) });
  }
}
