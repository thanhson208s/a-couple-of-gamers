import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsThrottler } from './ws.throttler';
import { WsInterceptor } from './ws.interceptor';
import { DiscoveryModule } from '@nestjs/core';
import { WsController } from './ws.controller';
import { WsService } from './ws.service';
import { GuardsModule } from '../../common/guards/guards.module';

@Module({
  imports: [DiscoveryModule, GuardsModule],
  controllers: [WsController],
  providers: [WsGateway, WsThrottler, WsInterceptor, WsService],
  exports: [WsGateway],
})
export class WsModule {}
