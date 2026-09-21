import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiError } from '../../common/errors';
import type { AuthActor } from '../../common/types/actor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OwnerApplyDto } from '../auth/dto/auth.dto';
import { PrivilegedWritesService } from '../privileged/privileged-writes.service';
import { OwnersRepository } from './owners.repository';

@ApiTags('owners')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(
    private readonly owners: OwnersRepository,
    private readonly privileged: PrivilegedWritesService,
  ) {}

  @Post('apply')
  @ApiOperation({
    summary: 'Apply to list vehicles',
    description:
      'Creates an unverified owner profile at the default commission. is_verified and commission_bps are not writable by app_role at all, so the defaults in the database are the only reachable values. An unverified owner cannot publish a vehicle — Phase 3 enforces that.',
  })
  apply(@CurrentUser() actor: AuthActor, @Body() body: OwnerApplyDto) {
    return this.privileged.applyForOwnerProfile(actor, body.payoutAccountRef);
  }

  @Get('me')
  // No @Roles here on purpose. Applying creates an owner_profiles row but does
  // NOT change users.role — an admin does that in Phase 11 — so a role gate
  // would make this route unreachable for exactly the people it is for. The
  // query is scoped to the caller anyway: somebody who has not applied gets a
  // 404, which is also the truthful answer.
  @ApiOperation({ summary: "The caller's owner profile" })
  async me(@CurrentUser() actor: AuthActor) {
    const profile = await this.owners.findProfile(actor, actor.id);
    if (!profile) throw ApiError.notFound('Owner profile');
    return profile;
  }
}
