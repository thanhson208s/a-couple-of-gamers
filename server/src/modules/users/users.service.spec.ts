import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { mockRepository } from '../../common/test/helpers';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: ReturnType<typeof mockRepository<User>>;

  beforeEach(async () => {
    usersRepo = mockRepository<User>();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('findById', () => {
    it.todo('returns the user when found');
    it.todo('returns null when not found');
  });

  describe('findOrCreate', () => {
    it.todo('returns existing user without inserting');
    it.todo('generates an ID and inserts a new user when none exists');
    it.todo('throws InternalServerErrorException after 5 consecutive ID collisions');
  });
});
