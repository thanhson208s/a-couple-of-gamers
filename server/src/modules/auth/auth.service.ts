import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
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
