import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WebSocket } from 'ws';
import { Observable, EMPTY } from 'rxjs';
import { WsThrottler } from './ws.throttler';

interface WsThrottleOptions {
  limit: number;
  ttl: number; // milliseconds
}

const WS_THROTTLE_OPTIONS = 'WS_THROTTLE_OPTIONS';

@Injectable()
export class WsInterceptor implements NestInterceptor {
  constructor(
    private readonly wsThrottler: WsThrottler,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const client = context.switchToWs().getClient<WebSocket>();
    const userId = (client as any).userId as string | undefined;

    if (userId) {
      const options = this.reflector.get<WsThrottleOptions>(WS_THROTTLE_OPTIONS, context.getHandler());
      const event = context.getHandler().name;
      const allowed = await this.wsThrottler.check(event, userId, options);
      if (!allowed) {
        client.send(JSON.stringify({ event: 'error', data: { code: 'RATE_LIMITED' } }));
        return EMPTY;
      }
    }

    return next.handle();
  }
}

export const WsThrottle = (options?: Partial<WsThrottleOptions>) =>
  options
    ? (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
        SetMetadata(WS_THROTTLE_OPTIONS, options)(target, key, descriptor);
        UseInterceptors(WsInterceptor)(target, key, descriptor);
      }
    : UseInterceptors(WsInterceptor);
