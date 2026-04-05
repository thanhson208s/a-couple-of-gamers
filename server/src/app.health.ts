import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppHealth {
  @Get()
  check() {
    return { status: 'ok', db: 'ok', cache: 'ok' };
  }
}
