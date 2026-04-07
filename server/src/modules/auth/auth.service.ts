import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async devLogin(accountId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findOrCreate('dev', accountId, accountId);
    const payload = { sub: user.id, provider: user.provider };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  async socialLogin(_idToken: string) {
    throw new Error('not implemented');
  }

  async refresh(_refreshToken: string) {
    throw new Error('not implemented');
  }

  async issueWsTicket() {
    throw new Error('not implemented');
  }

  async guestMerge() {
    throw new Error('not implemented');
  }
}
