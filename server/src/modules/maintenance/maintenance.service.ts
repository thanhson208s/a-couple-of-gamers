import { BadRequestException, Injectable } from '@nestjs/common';
import { OnWsConnected } from '../ws/ws.decorators';
import { WsGateway } from '../ws/ws.gateway';

export interface MaintenanceState {
  maintenanceTime: number;
  maintenanceDuration: number;
}

export interface MaintenanceAnnouncement {
  maintenanceAfter: number;
  maintenanceDuration: number;
}

@Injectable()
export class MaintenanceService {
  private state: MaintenanceState | null = null;

  constructor(private readonly wsGateway: WsGateway) {}

  announce(maintenanceAfter: number, maintenanceDuration: number): MaintenanceAnnouncement {
    if (maintenanceDuration <= 0) {
      throw new BadRequestException('maintenance duration must be positive');
    }

    if (maintenanceAfter <= 0) {
      throw new BadRequestException('maintenance time must be in the future');
    }

    this.state = { maintenanceTime: Date.now() + maintenanceAfter, maintenanceDuration };
    this.wsGateway.broadcastToAll({
      event: 'system:maintenance',
      maintenanceAfter,
      maintenanceDuration,
    });

    return { maintenanceAfter, maintenanceDuration };
  }

  clear(): void {
    this.state = null;
  }

  check(): MaintenanceAnnouncement | null {
    if (!this.state) return null;

    const maintenanceAfter = this.state.maintenanceTime - Date.now();
    if (maintenanceAfter <= 0) {
      this.state = null;
      return null;
    }

    return {
      maintenanceAfter,
      maintenanceDuration: this.state.maintenanceDuration,
    };
  }

  @OnWsConnected()
  onUserConnected(payload: { userId: string }): void {
    const announcement = this.check();
    if (!announcement) return;

    this.wsGateway.broadcastToUser(payload.userId, {
      event: 'system:maintenance',
      maintenanceAfter: announcement.maintenanceAfter,
      maintenanceDuration: announcement.maintenanceDuration,
    });
  }
}
