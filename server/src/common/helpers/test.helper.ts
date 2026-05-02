import { ExecutionContext } from '@nestjs/common';
import { Repository } from 'typeorm';

/**
 * Returns a jest mock shaped like a TypeORM Repository.
 * Only the methods used in this codebase are stubbed — add more as needed.
 */
export function mockRepository<T extends object>(): jest.Mocked<Pick<Repository<T>, 'findOne' | 'save' | 'create' | 'existsBy' | 'update' | 'find' | 'delete' | 'count' | 'increment'>> {
  return {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    existsBy: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    increment: jest.fn(),
  };
}

/**
 * Builds a minimal NestJS ExecutionContext mock for guard tests.
 * Pass a partial request object; only the fields your guard reads need to be set.
 */
export function mockHttpContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}
