import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../modules/auth/decorators/public.decorator';
import { HealthRepository } from './health.repository';

// Health checks run before anything holds a token — the orchestrator has
// none. Explicitly public, which is the only way a route becomes reachable
// once JwtAuthGuard is global.
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly repo: HealthRepository,
  ) {}

  /** Liveness: the process is up. Deliberately checks NOTHING else — a database
   *  blip must not make the orchestrator restart a healthy process, which is
   *  the classic way a partial outage becomes a total one. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: we can actually serve traffic. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.probe('database', () => this.repo.pingDatabase()),
      () => this.probe('redis', () => this.repo.pingRedis()),
    ]);
  }

  private async probe(key: string, run: () => Promise<void>): Promise<HealthIndicatorResult> {
    const check = this.indicator.check(key);
    try {
      await run();
      return check.up();
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }
}
