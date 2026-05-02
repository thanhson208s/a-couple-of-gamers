import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const token = extractBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException();
    try {
      req.user = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export interface JwtUser {
  id: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
