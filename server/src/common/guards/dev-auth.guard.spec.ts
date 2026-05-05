import { NotFoundException } from '@nestjs/common';
import { DevAuthGuard } from './dev-auth.guard';
import { mockHttpContext } from '../helpers/test.helper';

describe('DevAuthGuard', () => {
  let guard: DevAuthGuard;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    guard = new DevAuthGuard();
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    Object.assign(process.env, savedEnv);
  });

  it('returns true when NODE_ENV is "development" and CF_TEAM_DOMAIN is not set', () => {
    delete process.env.CF_TEAM_DOMAIN;
    process.env.NODE_ENV = 'development';
    const ctx = mockHttpContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws NotFoundException when CF_TEAM_DOMAIN is set', () => {
    process.env.CF_TEAM_DOMAIN = 'myteam.cloudflareaccess.com';
    process.env.NODE_ENV = 'development';
    const ctx = mockHttpContext({});
    expect(() => guard.canActivate(ctx)).toThrow(NotFoundException);
  });

  it('throws NotFoundException when NODE_ENV is not "development"', () => {
    delete process.env.CF_TEAM_DOMAIN;
    process.env.NODE_ENV = 'production';
    const ctx = mockHttpContext({});
    expect(() => guard.canActivate(ctx)).toThrow(NotFoundException);
  });
});
