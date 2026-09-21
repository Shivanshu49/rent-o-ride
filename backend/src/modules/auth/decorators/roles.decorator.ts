import { SetMetadata } from '@nestjs/common';
import type { AuthActor } from '../../../common/types/actor';

export const ROLES = 'auth:roles';

export const Roles = (...roles: AuthActor['role'][]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);
