import { Global, Module } from '@nestjs/common';
import { PrivilegedWritesService } from './privileged-writes.service';

/**
 * Global so that the modules needing a privileged transition import nothing but
 * the service — and so the list of modules that could do one is not a list at
 * all. What matters is that there is exactly ONE implementation, and that
 * `scripts/check-boundaries.mjs` still refuses PRISMA_ADMIN everywhere else.
 */
@Global()
@Module({ providers: [PrivilegedWritesService], exports: [PrivilegedWritesService] })
export class PrivilegedModule {}
