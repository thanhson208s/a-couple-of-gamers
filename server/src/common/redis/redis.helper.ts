import { RedisOptions } from 'ioredis';

function decodeUrlPart(value: string): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}

export function getRedisOptions(overrides: RedisOptions = {}): RedisOptions {
  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) throw new Error('REDIS_URL is required');

  const url = new URL(rawUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
  if (db !== undefined && !Number.isInteger(db)) {
    throw new Error('REDIS_URL database must be an integer');
  }

  const options: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'rediss:' ? 6380 : 6379,
  };

  const username = decodeUrlPart(url.username);
  const password = decodeUrlPart(url.password) ?? process.env.REDIS_PASSWORD;

  if (username) options.username = username;
  if (password) options.password = password;
  if (db !== undefined) options.db = db;
  if (url.protocol === 'rediss:') options.tls = {};

  return { ...options, ...overrides };
}
