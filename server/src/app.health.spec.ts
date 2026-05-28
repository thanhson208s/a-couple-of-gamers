import { AppHealth } from './app.health';

describe('AppHealth', () => {
  let dataSource: { query: jest.Mock };
  let redis: { ping: jest.Mock };
  let health: AppHealth;

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };
    health = new AppHealth(dataSource as any, redis as any);
  });

  it('returns ok when database and cache probes pass', async () => {
    await expect(health.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      cache: 'ok',
    });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('returns a 503 response body when the database probe fails', async () => {
    dataSource.query.mockRejectedValue(new Error('db down'));

    await expect(health.check()).rejects.toMatchObject({
      response: {
        status: 'error',
        db: 'error',
        cache: 'ok',
      },
    });
  });

  it('returns a 503 response body when the cache probe fails', async () => {
    redis.ping.mockRejectedValue(new Error('cache down'));

    await expect(health.check()).rejects.toMatchObject({
      response: {
        status: 'error',
        db: 'ok',
        cache: 'error',
      },
    });
  });

  it('marks cache as error when Redis does not respond with PONG', async () => {
    redis.ping.mockResolvedValue('NOPE');

    await expect(health.check()).rejects.toMatchObject({
      response: {
        status: 'error',
        db: 'ok',
        cache: 'error',
      },
    });
  });
});
