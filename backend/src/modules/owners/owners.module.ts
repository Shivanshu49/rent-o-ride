import { Module } from '@nestjs/common';
import { OwnersController } from './owners.controller';
import { OwnersRepository } from './owners.repository';

@Module({
  controllers: [OwnersController],
  providers: [OwnersRepository],
  exports: [OwnersRepository],
})
export class OwnersModule {}
