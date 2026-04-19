import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { ConfigService } from '../config/config.service';
import { GamesService } from '../games/games.service';
import { EnableGameDto } from './enable-game.dto';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    private readonly configService: ConfigService,
    private readonly gamesService: GamesService,
  ) {}

  @Get('config')
  getConfig() {
    return this.configService.getConfig();
  }

  @Put('config')
  updateConfig(@Body() body: unknown) {
    return this.configService.updateConfig(body);
  }

  @Put('enable-game')
  enableGame(@Body() dto: EnableGameDto) {
    return this.gamesService.enableGame(dto.slug, dto.enabled);
  }
}
