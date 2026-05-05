import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

const WS_RATE_LIMIT = 30;
const WS_TTL_SECONDS = 60;

export const WS_THROTTLE_CONFIG: Record<string, { limit: number; ttl: number } | undefined> = {
  // event-specific overrides — events not listed use defaults above
  'match:action': { limit: 10, ttl: 60 },
};

@Injectable()
export class WsThrottler {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(
    event: string,
    userId: string,
  ): Promise<boolean> {
    const options = WS_THROTTLE_CONFIG[event];
    const limit = options?.limit ?? WS_RATE_LIMIT;
    const ttlSeconds = options?.ttl ?? WS_TTL_SECONDS;

    const key = `ws:throttle:${event}:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ttlSeconds);
    return count <= limit;
  }
}
