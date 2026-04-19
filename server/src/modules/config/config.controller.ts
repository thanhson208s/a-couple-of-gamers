import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ConfigService } from './config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
  getConfig() {
    return this.configService.getConfig();
  }
}
