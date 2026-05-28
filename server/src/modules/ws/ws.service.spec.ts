import { WsService } from './ws.service';

describe('WsService', () => {
  const USER_ID = 'user-1';

  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let service: WsService;

  beforeEach(() => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
    };
    service = new WsService(redis as any);
  });

  describe('issueWsTicket', () => {
    it('stores a one-minute ticket and returns the generated token', async () => {
      const ticket = await service.issueWsTicket(USER_ID);

      expect(ticket).toMatch(/^[0-9a-f]{40}$/);
      expect(redis.set).toHaveBeenCalledWith(`ws:ticket:${ticket}`, USER_ID, 'EX', 60);
    });
  });

  describe('validateWsTicket', () => {
    it('returns and consumes the user id for a valid ticket', async () => {
      redis.get.mockResolvedValue(USER_ID);

      await expect(service.validateWsTicket('ticket')).resolves.toBe(USER_ID);

      expect(redis.get).toHaveBeenCalledWith('ws:ticket:ticket');
      expect(redis.del).toHaveBeenCalledWith('ws:ticket:ticket');
    });

    it('returns null and does not delete when a ticket is missing', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.validateWsTicket('missing')).resolves.toBeNull();

      expect(redis.get).toHaveBeenCalledWith('ws:ticket:missing');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('does not delete when Redis returns an empty value', async () => {
      redis.get.mockResolvedValue('');

      await expect(service.validateWsTicket('empty')).resolves.toBe('');

      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
