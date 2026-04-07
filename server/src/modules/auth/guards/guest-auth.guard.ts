import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class GuestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; body: Record<string, unknown> }>();
    const guestId = req.headers['x-guest-id'];
    if (!guestId) throw new UnauthorizedException();
    req.body = { ...req.body, guestId };
    return true;
  }
}
