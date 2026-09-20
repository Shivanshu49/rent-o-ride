import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/config.module';

export const REDIS = Symbol('REDIS');

/** One shared ioredis connection: health checks, the throttler store and the
 *  idempotency cache all use it. BullMQ opens its own — it needs blocking
 *  commands, which would stall anything else sharing the socket. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new Redis(config.get('REDIS_URL'), {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
          enableOfflineQueue: true,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor() {}

  async onApplicationShutdown(): Promise<void> {
    // The provider instance is closed by Nest's shutdown hooks on the client
    // itself; nothing to do here beyond declaring the intent.
  }
}
