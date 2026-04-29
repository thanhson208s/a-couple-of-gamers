import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WsGateway } from './ws.gateway';
import { WsThrottler } from './ws.throttler';
import { WsInterceptor } from './ws.interceptor';
import { WsProcessor } from './ws.processor';
import { MatchesModule } from '../matches/matches.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL } }),
    BullModule.registerQueue({ name: 'websocket' }),
    MatchesModule,
    AuthModule
  ],
  providers: [WsGateway, WsThrottler, WsInterceptor, WsProcessor],
  exports: [WsGateway],
})
export class WsModule {}
