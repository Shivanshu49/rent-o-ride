import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { AdminPrismaClient, ScopedPrismaClient } from './prisma.service';
import { PRISMA_ADMIN, PRISMA_SCOPED } from './prisma.tokens';

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_SCOPED,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new ScopedPrismaClient(config.get('DATABASE_URL')),
    },
    {
      provide: PRISMA_ADMIN,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new AdminPrismaClient(config.get('DIRECT_URL')),
    },
  ],
  exports: [PRISMA_SCOPED, PRISMA_ADMIN],
})
export class PrismaModule {}
