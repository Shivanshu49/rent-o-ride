import { createZodDto } from 'nestjs-zod';
import { kycUploadRequestSchema } from '@ror/shared';

/** One schema, used by the DTO here and by the web form. No drift. */
export class KycUploadRequestDto extends createZodDto(kycUploadRequestSchema) {}
