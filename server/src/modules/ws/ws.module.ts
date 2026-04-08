import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsThrottler } from './ws.throttler';
import { WsInterceptor } from './ws.interceptor';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [MatchesModule],
  providers: [WsGateway, WsThrottler, WsInterceptor],
})
export class WsModule {}
