import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppGuard } from './app.guard';

function mockContext(type: string): ExecutionContext {
  return { getType: () => type } as unknown as ExecutionContext;
}

describe('AppGuard', () => {
  let guard: AppGuard;

  beforeEach(() => {
    // Only testing the two overridden methods — bypass ThrottlerGuard constructor
    guard = Object.create(AppGuard.prototype) as AppGuard;
  });

  describe('shouldSkip', () => {
    it('returns true immediately for non-HTTP contexts without calling parent', async () => {
      // shouldSkip is protected — cast prototype to any to spy on it
      const parentShouldSkip = jest.spyOn(ThrottlerGuard.prototype as any, 'shouldSkip');
      const ctx = mockContext('ws');

      const result = await (guard as any).shouldSkip(ctx);

      expect(result).toBe(true);
      expect(parentShouldSkip).not.toHaveBeenCalled();
      parentShouldSkip.mockRestore();
    });

    it('delegates to parent ThrottlerGuard for HTTP contexts', async () => {
      const parentShouldSkip = jest
        .spyOn(ThrottlerGuard.prototype as any, 'shouldSkip')
        .mockResolvedValue(false);
      const ctx = mockContext('http');

      const result = await (guard as any).shouldSkip(ctx);

      expect(parentShouldSkip).toHaveBeenCalledWith(ctx);
      expect(result).toBe(false);
      parentShouldSkip.mockRestore();
    });
  });

  describe('getTracker', () => {
    it('returns "user:<id>" for authenticated requests', async () => {
      const req = { user: { id: 'ABCD123456' }, ip: '127.0.0.1' };
      expect(await (guard as any).getTracker(req)).toBe('user:ABCD123456');
    });

    it('falls back to IP when request has no user', async () => {
      const req = { user: undefined, ip: '192.168.1.100' };
      expect(await (guard as any).getTracker(req)).toBe('192.168.1.100');
    });

    it('falls back to IP when user has no id', async () => {
      const req = { user: {}, ip: '10.0.0.1' };
      expect(await (guard as any).getTracker(req)).toBe('10.0.0.1');
    });
  });
});
