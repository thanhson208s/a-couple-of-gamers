import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from './common/redis/redis.module';

type HealthState = 'ok' | 'error';

interface HealthResponse {
  status: HealthState;
  db: HealthState;
  cache: HealthState;
}

@Controller('health')
export class AppHealth {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [db, cache] = await Promise.all([
      this.checkDb(),
      this.checkCache(),
    ]);

    const status: HealthState = db === 'ok' && cache === 'ok' ? 'ok' : 'error';
    const response = { status, db, cache };

    if (status === 'error') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  private async checkDb(): Promise<HealthState> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkCache(): Promise<HealthState> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
