import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

// Default ws-throttle limits (matches ThrottlerModule config in app.module.ts)
const WS_RATE_LIMIT = 30;
const WS_TTL_SECONDS = 60;

@Injectable()
export class WsThrottler {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(
    event: string,
    userId: string,
    options?: { limit?: number; ttl?: number },
  ): Promise<boolean> {
    const limit = options?.limit ?? WS_RATE_LIMIT;
    const ttlMs = options?.ttl ?? WS_TTL_SECONDS * 1000;
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const key = `throttle:ws-throttle:${event}:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ttlSeconds);
    return count <= limit;
  }
}
