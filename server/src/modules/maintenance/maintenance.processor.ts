import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WsGateway } from '../ws/ws.gateway';
import { MaintenanceService } from './maintenance.service';

@Processor('maintenance')
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly wsGateway: WsGateway,
    private readonly maintenanceService: MaintenanceService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'schedule') {
      const { maintenanceTime, maintenanceDuration } = job.data as {
        maintenanceTime: number;
        maintenanceDuration: number;
      };
      const maintenanceAfter = maintenanceTime - Date.now();
      if (maintenanceAfter <= 0) return;

      this.maintenanceService.setState({ maintenanceTime, maintenanceDuration });
      this.wsGateway.broadcastToAll({
        event: 'system:maintenance',
        maintenanceAfter,
        maintenanceDuration,
      });
    }
  }
}
