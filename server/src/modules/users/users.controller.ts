import { Controller, Get, Put, Delete, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile() {
    return this.usersService.getProfile();
  }

  @Delete('profile')
  deleteAccount() {
    return this.usersService.deleteAccount();
  }

  @Put('device-token')
  upsertDeviceToken(@Body() body: { token: string; platform: 'ios' | 'android' }) {
    return this.usersService.upsertDeviceToken(body);
  }

  @Get('favorites')
  getFavorites() {
    return this.usersService.getFavorites();
  }

  @Put('favorites/:gameSlug')
  addFavorite(@Param('gameSlug') gameSlug: string) {
    return this.usersService.addFavorite(gameSlug);
  }

  @Delete('favorites/:gameSlug')
  removeFavorite(@Param('gameSlug') gameSlug: string) {
    return this.usersService.removeFavorite(gameSlug);
  }

  @Get('rivals')
  getRivals() {
    return this.usersService.getRivals();
  }

  @Get('rivals/:opponentId')
  getRivalStats(@Param('opponentId') opponentId: string) {
    return this.usersService.getRivalStats(opponentId);
  }
}
