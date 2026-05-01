import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsThrottler } from './ws.throttler';
import { WsInterceptor } from './ws.interceptor';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryModule } from '@nestjs/core';

@Module({
  imports: [AuthModule, DiscoveryModule],
  providers: [WsGateway, WsThrottler, WsInterceptor],
  exports: [WsGateway],
})
export class WsModule {}
