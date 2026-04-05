import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ConfigService as ConfigService } from '../config/config.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly configService: ConfigService) {}

  @Get('config')
  getConfig() {
    return this.configService.getConfig();
  }

  @Put('config')
  updateConfig(@Body() body: unknown) {
    return this.configService.updateConfig(body);
  }
}
