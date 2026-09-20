import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthRepository } from './health.repository';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthRepository],
})
export class HealthModule {}
