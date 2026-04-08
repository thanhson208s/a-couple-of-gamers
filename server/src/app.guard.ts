import { ExecutionContext, Injectable } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

export const AppThrottle = (options: { ttl: number; limit: number }) =>
  Throttle({ 'app-throttle': options });

@Injectable()
export class AppGuard extends ThrottlerGuard {
  // Skip non-HTTP contexts (e.g. WebSocket message handlers)
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.shouldSkip(context);
  }

  // Track by userId for authenticated requests, fall back to IP
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { id?: string } | undefined;
    return user?.id ? `user:${user.id}` : (req['ip'] as string);
  }
}
