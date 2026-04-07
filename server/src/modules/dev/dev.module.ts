import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchesModule } from '../matches/matches.module';
import { DevController } from './dev.controller';

@Module({
  imports: [AuthModule, MatchesModule],
  controllers: [DevController],
})
export class DevModule {}
