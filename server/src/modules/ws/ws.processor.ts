import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WsGateway } from './ws.gateway';

@Processor('websocket')
export class WsProcessor extends WorkerHost {
  constructor(private readonly wsGateway: WsGateway) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'maintenance') {
      const { maintenanceTime, maintenanceDuration } = job.data as {
        maintenanceTime: string;
        maintenanceDuration: number;
      };
      this.wsGateway.setMaintenance({ maintenanceTime, maintenanceDuration });
      this.wsGateway.broadcastToAll({
        event: 'system:maintenance',
        maintenanceTime,
        maintenanceDuration,
      });
    }
  }
}
