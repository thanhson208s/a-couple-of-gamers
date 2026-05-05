import { randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { Redis } from 'ioredis'

@Injectable()
export class WsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async issueWsTicket(userId: string) {
    const ticket = randomBytes(20).toString('hex');
    await this.redis.set(`ws:ticket:${ticket}`, userId, 'EX', 60);
    return ticket;
  }

  async validateWsTicket(ticket: string) {
    const userId = await this.redis.get(`ws:ticket:${ticket}`);
    if (userId) await this.redis.del(`ws:ticket:${ticket}`);
    return userId;
  }
}
