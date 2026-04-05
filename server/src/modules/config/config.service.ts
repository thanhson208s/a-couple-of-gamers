import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  async getConfig() {
    // TODO: read from config table
    throw new Error('not implemented');
  }

  async updateConfig(_config: unknown) {
    throw new Error('not implemented');
  }
}
