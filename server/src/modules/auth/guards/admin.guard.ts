import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
