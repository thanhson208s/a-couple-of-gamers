import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { getRedisOptions } from '../../common/redis/redis.helper';
import { WsModule } from '../ws/ws.module';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceService } from './maintenance.service';

// HTTP-only module: owns the maintenance state, the BullMQ 'maintenance' queue,
// and the processor that drives it. Listens to ws:connected so late-joining
// clients still receive the system:maintenance notice. Kept separate from
// WsModule so the worker process (which imports MatchesModule → WsModule for
// the gateway) does not register a competing consumer.
@Module({
  imports: [
    BullModule.forRoot({
      connection: getRedisOptions({ maxRetriesPerRequest: null }),
    }),
    BullModule.registerQueue({ name: 'maintenance' }),
    WsModule,
  ],
  providers: [MaintenanceProcessor, MaintenanceService],
})
export class MaintenanceModule {}
