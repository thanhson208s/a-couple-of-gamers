import { Module } from '@nestjs/common';
import { GuardsModule } from '../../common/guards/guards.module';
import { MatchesModule } from '../matches/matches.module';
import { AuthModule } from '../auth/auth.module';
import { DevController } from './dev.controller';

@Module({
  imports: [GuardsModule, AuthModule, MatchesModule],
  controllers: [DevController],
})
export class DevModule {}
