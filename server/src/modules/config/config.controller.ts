import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from './config.service';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
  getConfig() {
    return this.configService.getConfig();
  }
}
