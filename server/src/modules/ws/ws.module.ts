import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsThrottler } from './ws.throttler';
import { WsInterceptor } from './ws.interceptor';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryModule } from '@nestjs/core';
import { WsController } from './ws.controller';
import { WsService } from './ws.service';

@Module({
  imports: [AuthModule, DiscoveryModule],
  controllers: [WsController],
  providers: [WsGateway, WsThrottler, WsInterceptor, WsService],
  exports: [WsGateway],
})
export class WsModule {}
