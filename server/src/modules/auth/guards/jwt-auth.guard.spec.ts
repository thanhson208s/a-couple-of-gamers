import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { mockHttpContext } from '../../../common/helpers/test.helper';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    guard = new JwtAuthGuard(jwtService as unknown as JwtService);
  });

  it('returns true and attaches decoded payload to req.user for a valid Bearer token', () => {
    const payload = { id: 'u1', type: 'guest' };
    jwtService.verify.mockReturnValue(payload);
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer valid_token' } };
    const ctx = mockHttpContext(req);

    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('valid_token');
    expect(req.user).toEqual(payload);
  });

  it('throws UnauthorizedException when the Authorization header is absent', () => {
    const ctx = mockHttpContext({ headers: {} });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the Authorization header is not a Bearer token', () => {
    const ctx = mockHttpContext({ headers: { authorization: 'Basic abc123' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when JwtService.verify throws', () => {
    jwtService.verify.mockImplementation(() => { throw new Error('invalid signature'); });
    const ctx = mockHttpContext({ headers: { authorization: 'Bearer bad_token' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
