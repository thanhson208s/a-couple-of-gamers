import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  async sendPush(_userId: string, _type: string, _payload: unknown) {
    throw new Error('not implemented');
  }
}
