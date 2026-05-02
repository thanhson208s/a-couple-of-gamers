import { Controller, Get, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
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
  upsertDeviceToken(@Body() body: { token: string; platform: 'ios' | 'android' }) {
    return this.usersService.upsertDeviceToken(body);
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
