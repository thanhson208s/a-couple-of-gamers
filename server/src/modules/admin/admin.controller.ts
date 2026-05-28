import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ConfigService } from '../config/config.service';
import { GamesService } from '../games/games.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { MaintenanceAnnouncementDto } from './maintenance-announcement.dto';
import { UpdateConfigDto } from './update-config.dto';
import { UpdateGameDto } from './update-game.dto';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    private readonly configService: ConfigService,
    private readonly gamesService: GamesService,
    private readonly maintenanceService: MaintenanceService,
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

  @Get('maintenance')
  getMaintenanceAnnouncement() {
    return this.maintenanceService.check();
  }

  @Put('maintenance')
  setMaintenanceAnnouncement(@Body() dto: MaintenanceAnnouncementDto) {
    return this.maintenanceService.announce(dto.maintenanceAfter, dto.maintenanceDuration);
  }

  @Delete('maintenance')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearMaintenanceAnnouncement() {
    return this.maintenanceService.clear();
  }
}
