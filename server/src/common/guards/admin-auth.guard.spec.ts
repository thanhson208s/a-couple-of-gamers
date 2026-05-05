import { generateKeyPairSync } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from './admin-auth.guard';
import { mockHttpContext } from '../helpers/test.helper';

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard;
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    guard = new AdminAuthGuard(jwtService as unknown as JwtService);
    // Reset JWKS cache between tests
    (guard as any).jwksCache = null;
  });

  afterEach(() => {
    // Restore env variables modified in each test
    Object.keys(process.env).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    Object.assign(process.env, savedEnv);
  });

  describe('local dev fallback (CF Access not configured)', () => {
    beforeEach(() => {
      delete process.env.CF_TEAM_DOMAIN;
      delete process.env.CF_ACCESS_AUD;
      process.env.ADMIN_TOKEN = 'secret-admin-token';
    });

    it('returns true when x-admin-token matches ADMIN_TOKEN', async () => {
      const ctx = mockHttpContext({ headers: { 'x-admin-token': 'secret-admin-token' } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('throws UnauthorizedException when x-admin-token does not match', async () => {
      const ctx = mockHttpContext({ headers: { 'x-admin-token': 'wrong-token' } });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when x-admin-token header is absent', async () => {
      const ctx = mockHttpContext({ headers: {} });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('CF Access mode (CF_TEAM_DOMAIN and CF_ACCESS_AUD set)', () => {
    // Generate a real RSA key pair once for the suite so JWKS resolution succeeds
    const KID = 'test-kid-001';
    let jwkWithKid: JsonWebKey & { kid: string };
    let fakeToken: string;

    beforeAll(() => {
      const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
      jwkWithKid = { ...jwk, kid: KID };
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: KID })).toString('base64url');
      fakeToken = `${header}.e30.sig`;
    });

    beforeEach(() => {
      process.env.CF_TEAM_DOMAIN = 'myteam.cloudflareaccess.com';
      process.env.CF_ACCESS_AUD = 'test-aud-value';
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ keys: [jwkWithKid] }),
      }) as unknown as typeof fetch;
    });

    it('returns true for a valid CF Access token', async () => {
      jwtService.verify.mockReturnValue({});
      const ctx = mockHttpContext({ headers: { 'cf-access-jwt-assertion': fakeToken } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('throws UnauthorizedException when cf-access-jwt-assertion header is absent', async () => {
      const ctx = mockHttpContext({ headers: {} });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no JWKS key matches the token kid', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ keys: [] }),
      });
      const ctx = mockHttpContext({ headers: { 'cf-access-jwt-assertion': fakeToken } });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when jwtService.verify rejects the token', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid audience'); });
      const ctx = mockHttpContext({ headers: { 'cf-access-jwt-assertion': fakeToken } });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});
