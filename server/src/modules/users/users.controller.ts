import { Controller, Get, Put, Delete, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../auth/guards/jwt-auth.guard';
import { DeleteAccountDto } from './delete-account.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: JwtUser) {
    return this.usersService.getProfile(user.id);
  }

  @Delete('profile')
  deleteAccount(@CurrentUser() user: JwtUser, @Body() body: DeleteAccountDto) {
    return this.usersService.deleteAccount(user.id, body.idToken);
  }

  @Put('device')
  @HttpCode(204)
  upsertDeviceToken(@CurrentUser() user: JwtUser, @Body() body: { token: string; platform: string }) {
    return this.usersService.upsertDeviceToken(user.id, body.token, body.platform);
  }

  @Delete('device')
  @HttpCode(204)
  deleteDeviceToken(@CurrentUser() user: JwtUser, @Body() body: { token: string }) {
    return this.usersService.deleteDeviceToken(user.id, body.token);
  }

  @Put('favorites/:gameId')
  addFavorite(@CurrentUser() user: JwtUser, @Param('gameId') gameId: string) {
    return this.usersService.addFavorite(user.id, gameId);
  }

  @Delete('favorites/:gameId')
  removeFavorite(@CurrentUser() user: JwtUser, @Param('gameId') gameId: string) {
    return this.usersService.removeFavorite(user.id, gameId);
  }

  @Get('stats')
  getStats(@CurrentUser() user: JwtUser) {
    return this.usersService.getStats(user.id);
  }

  @Get('rivals/:opponentId')
  getRival(@CurrentUser() user: JwtUser, @Param('opponentId') opponentId: string) {
    return this.usersService.getRival(user.id, opponentId);
  }
}
