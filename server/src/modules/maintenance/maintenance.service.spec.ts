import { BadRequestException } from '@nestjs/common';
import { WsGateway } from '../ws/ws.gateway';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  const NOW = 1_000;
  const MAINTENANCE_AFTER_MS = 10_000;
  const MAINTENANCE_DURATION_MS = 600;
  const USER_ID = 'user-1';

  const activeAnnouncement = {
    maintenanceAfter: MAINTENANCE_AFTER_MS,
    maintenanceDuration: MAINTENANCE_DURATION_MS,
  };

  let service: MaintenanceService;
  let wsGateway: jest.Mocked<Pick<WsGateway, 'broadcastToAll' | 'broadcastToUser'>>;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    wsGateway = {
      broadcastToAll: jest.fn(),
      broadcastToUser: jest.fn(),
    };
    service = new MaintenanceService(wsGateway as unknown as WsGateway);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const announce = () => service.announce(MAINTENANCE_AFTER_MS, MAINTENANCE_DURATION_MS);

  describe('announce', () => {
    it('stores the announcement, broadcasts it, and returns the public payload', () => {
      expect(announce()).toEqual(activeAnnouncement);
      expect(service.check()).toEqual(activeAnnouncement);
      expect(wsGateway.broadcastToAll).toHaveBeenCalledWith({
        event: 'system:maintenance',
        ...activeAnnouncement,
      });
    });

    it('stores the maintenance deadline relative to the current time', () => {
      announce();
      jest.spyOn(Date, 'now').mockReturnValue(NOW + 4_000);

      expect(service.check()).toEqual({
        maintenanceAfter: 6_000,
        maintenanceDuration: MAINTENANCE_DURATION_MS,
      });
    });

    it('rejects non-positive announcement lead times', () => {
      expect(() => service.announce(0, MAINTENANCE_DURATION_MS)).toThrow(BadRequestException);
      expect(wsGateway.broadcastToAll).not.toHaveBeenCalled();
    });

    it('rejects non-positive maintenance durations', () => {
      expect(() => service.announce(MAINTENANCE_AFTER_MS, 0)).toThrow(BadRequestException);
      expect(wsGateway.broadcastToAll).not.toHaveBeenCalled();
    });
  });

  describe('check', () => {
    it('returns null when no announcement is active', () => {
      expect(service.check()).toBeNull();
    });

    it('expires stale announcements instead of returning a negative lead time', () => {
      announce();
      jest.spyOn(Date, 'now').mockReturnValue(NOW + MAINTENANCE_AFTER_MS);

      expect(service.check()).toBeNull();
      expect(service.check()).toBeNull();
    });
  });

  describe('clear', () => {
    it('clears the active announcement and broadcasts a clear event', () => {
      announce();

      service.clear();

      expect(service.check()).toBeNull();
    });
  });

  describe('onUserConnected', () => {
    it('sends the active announcement to a newly connected user', () => {
      announce();
      wsGateway.broadcastToUser.mockClear();

      service.onUserConnected({ userId: USER_ID });

      expect(wsGateway.broadcastToUser).toHaveBeenCalledWith(USER_ID, {
        event: 'system:maintenance',
        ...activeAnnouncement,
      });
    });

    it('does not send anything when no announcement is active', () => {
      service.onUserConnected({ userId: USER_ID });

      expect(wsGateway.broadcastToUser).not.toHaveBeenCalled();
    });

    it('does not send an expired announcement to a newly connected user', () => {
      announce();
      jest.spyOn(Date, 'now').mockReturnValue(NOW + MAINTENANCE_AFTER_MS);

      service.onUserConnected({ userId: USER_ID });

      expect(wsGateway.broadcastToUser).not.toHaveBeenCalled();
    });
  });
});
