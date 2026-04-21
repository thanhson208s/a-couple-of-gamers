import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { ConfigService } from '../config/config.service';
import { GamesService } from '../games/games.service';
import { UpdateGameStatusDto } from './update-game-status.dto';

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

  @Put('games/:slug/status')
  setGameStatus(@Param('slug') slug: string, @Body() dto: UpdateGameStatusDto) {
    return this.gamesService.setGameStatus(slug, dto.status);
  }
}
