import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthActor } from '../../common/types/actor';
import { KycUploadRequestDto } from './dto/kyc.dto';
import { KycService } from './kyc.service';

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('documents')
  @ApiOperation({
    summary: 'Get a one-shot signed URL to upload a KYC document',
    description:
      'The browser PUTs the file straight to storage. The API never touches the bytes, and stores only the path plus a status — no ID numbers of any kind.',
  })
  requestUpload(@CurrentUser() actor: AuthActor, @Body() body: KycUploadRequestDto) {
    return this.kyc.requestUpload(actor, body);
  }

  @Get('documents')
  @ApiOperation({ summary: "List the caller's own KYC documents" })
  listMine(@CurrentUser() actor: AuthActor) {
    return this.kyc.listMine(actor);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Short-lived signed read URL for one document' })
  read(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.kyc.readUrl(actor, id);
  }
}
