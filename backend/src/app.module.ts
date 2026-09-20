import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { loggerConfig } from './common/logger';
import { AppConfig, AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
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
