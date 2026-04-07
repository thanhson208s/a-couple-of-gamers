import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  private jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
  private readonly jwksCacheTtl = 3_600_000; // 1 hour

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();

    // Local dev fallback: if CF Access not configured, use ADMIN_TOKEN
    if (!process.env.CF_TEAM_DOMAIN || !process.env.CF_ACCESS_AUD) {
      if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        throw new UnauthorizedException();
      }
      return true;
    }

    const token = req.headers['cf-access-jwt-assertion'];
    if (!token) throw new UnauthorizedException();

    try {
      const publicKey = await this.resolvePublicKey(token);
      this.jwtService.verify(token, {
        publicKey,
        algorithms: ['RS256'],
        audience: process.env.CF_ACCESS_AUD,
      });
    } catch {
      throw new UnauthorizedException();
    }

    return true;
  }

  private async resolvePublicKey(token: string): Promise<string> {
    const keys = await this.fetchJwks();
    const [headerB64] = token.split('.');
    const { kid } = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const jwk = keys.find((k) => (k as { kid?: string }).kid === kid);
    if (!jwk) throw new Error('No matching JWKS key');
    const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKeyInput['key'], format: 'jwk' });
    return key.export({ type: 'spki', format: 'pem' }) as string;
  }

  private async fetchJwks(): Promise<JsonWebKey[]> {
    const now = Date.now();
    if (this.jwksCache && now - this.jwksCache.fetchedAt < this.jwksCacheTtl) {
      return this.jwksCache.keys;
    }
    const res = await fetch(
      `https://${process.env.CF_TEAM_DOMAIN}/cdn-cgi/access/certs`,
    );
    const { keys } = (await res.json()) as { keys: JsonWebKey[] };
    this.jwksCache = { keys, fetchedAt: now };
    return keys;
  }
}
