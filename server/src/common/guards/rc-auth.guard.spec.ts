import { UnauthorizedException } from '@nestjs/common';
import { RcAuthGuard } from './rc-auth.guard';
import { mockHttpContext } from '../helpers/test.helper';

describe('RcAuthGuard', () => {
  let guard: RcAuthGuard;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    guard = new RcAuthGuard();
    process.env.RC_SECRET = 'test-rc-secret';
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    Object.assign(process.env, savedEnv);
  });

  it('returns true when Authorization header matches RC_SECRET', () => {
    const ctx = mockHttpContext({ headers: { authorization: 'Bearer test-rc-secret' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException when token does not match RC_SECRET', () => {
    const ctx = mockHttpContext({ headers: { authorization: 'Bearer wrong-secret' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when Authorization header is absent', () => {
    const ctx = mockHttpContext({ headers: {} });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when Authorization header is not Bearer scheme', () => {
    const ctx = mockHttpContext({ headers: { authorization: 'Basic test-rc-secret' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when RC_SECRET env var is not set', () => {
    delete process.env.RC_SECRET;
    const ctx = mockHttpContext({ headers: { authorization: 'Bearer test-rc-secret' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
