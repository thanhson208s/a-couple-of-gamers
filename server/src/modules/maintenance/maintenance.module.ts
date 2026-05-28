import { Module } from '@nestjs/common';
import { WsModule } from '../ws/ws.module';
import { MaintenanceService } from './maintenance.service';

// HTTP-only module: owns active maintenance announcement state and registers a
// WS connection lifecycle handler so late-joining clients still receive the
// system:maintenance notice.
@Module({
  imports: [WsModule],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
