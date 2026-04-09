import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { mockHttpContext } from '../../../common/test/helpers';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    guard = new JwtAuthGuard(jwtService as unknown as JwtService);
  });

  it.todo('returns true and attaches decoded payload to req.user for a valid Bearer token');
  it.todo('throws UnauthorizedException when the Authorization header is absent');
  it.todo('throws UnauthorizedException when the Authorization header is not a Bearer token');
  it.todo('throws UnauthorizedException when JwtService.verify throws');
});
