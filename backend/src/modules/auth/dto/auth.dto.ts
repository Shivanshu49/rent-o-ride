import { createZodDto } from 'nestjs-zod';
import { ownerApplySchema, refreshSessionSchema, requestOtpSchema, verifyOtpSchema } from '@ror/shared';

export class RequestOtpDto extends createZodDto(requestOtpSchema) {}
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
export class RefreshSessionDto extends createZodDto(refreshSessionSchema) {}
export class OwnerApplyDto extends createZodDto(ownerApplySchema) {}
