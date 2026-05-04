import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { ConfigService } from '../config/config.service';
import { GamesService } from '../games/games.service';
import { UpdateConfigDto } from './update-config.dto';
import { UpdateGameDto } from './update-game.dto';

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
  updateConfig(@Body() body: UpdateConfigDto) {
    return this.configService.updateConfig(body);
  }

  @Put('games/:slug')
  setGameStatus(@Param('slug') slug: string, @Body() dto: UpdateGameDto) {
    return this.gamesService.updateGame(slug, dto.name, dto.status);
  }
}
