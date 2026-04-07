import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.CF_TEAM_DOMAIN) throw new NotFoundException();
    if (process.env.DEV_MODE !== 'true') throw new NotFoundException();
    return true;
  }
}
