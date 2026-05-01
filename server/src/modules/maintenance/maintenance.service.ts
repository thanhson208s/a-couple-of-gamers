import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsGateway } from '../ws/ws.gateway';

interface MaintenanceState {
  maintenanceTime: number;
  maintenanceDuration: number;
}

@Injectable()
export class MaintenanceService {
  private state: MaintenanceState | null = null;

  constructor(private readonly wsGateway: WsGateway) {}

  setState(state: MaintenanceState | null): void {
    this.state = state;
  }

  @OnEvent('ws:connected')
  onUserConnected(payload: { userId: string }): void {
    if (!this.state) return;

    const maintenanceAfter = this.state.maintenanceTime - Date.now();
    if (maintenanceAfter <= 0) {
      this.state = null;
      return;
    }

    this.wsGateway.broadcastToUser(payload.userId, {
      event: 'system:maintenance',
      maintenanceAfter,
      maintenanceDuration: this.state.maintenanceDuration,
    });
  }
}
