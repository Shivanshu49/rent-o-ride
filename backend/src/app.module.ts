import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { loggerConfig } from './common/logger';
import { AppConfig, AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { KycModule } from './modules/kyc/kyc.module';
import { OwnersModule } from './modules/owners/owners.module';
import { PrivilegedModule } from './modules/privileged/privileged.module';
import { StorageModule } from './modules/storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfig],
      useFactory: loggerConfig,
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    // The single home for writes to columns app_role cannot touch. Imported
    // before the modules that call it, though being @Global it would resolve
    // either way.
    PrivilegedModule,
    // AuthModule registers the global guards, so it must be imported before
    // any module with routes that rely on them.
    AuthModule,
    OwnersModule,
    KycModule,
    HealthModule,
  ],
  providers: [
    // Global. Every DTO built with createZodDto is validated before a
    // controller sees it; a controller that forgets to type its body simply
    // has nothing to validate, which is visible in review.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
