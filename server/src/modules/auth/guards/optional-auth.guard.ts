import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Accepts either a valid JWT or an X-Guest-Id header.
// Never throws — endpoints must handle the case where neither is present.
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: unknown;
      guestId?: string;
    }>();

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        req.user = this.jwtService.verify(auth.slice(7));
        return true;
      } catch {
        // invalid token — fall through to guest check
      }
    }

    const guestId = req.headers['x-guest-id'];
    if (guestId) req.guestId = guestId;

    return true;
  }
}
