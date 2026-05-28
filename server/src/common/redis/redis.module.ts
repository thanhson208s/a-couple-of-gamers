import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisOptions } from './redis.helper';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(getRedisOptions()),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
