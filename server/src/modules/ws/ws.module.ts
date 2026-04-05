import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [MatchesModule],
  providers: [WsGateway],
})
export class WsModule {}
