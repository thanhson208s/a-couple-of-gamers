import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../../common/guards/jwt-auth.guard';
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

  @Get('friends')
  getFriendList(@CurrentUser() user: JwtUser) {
    return this.usersService.getFriendList(user.id);
  }

  @Delete('friends/:friendId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFriend(@CurrentUser() user: JwtUser, @Param('friendId') friendId: string) {
    return this.usersService.removeFriend(user.id, friendId);
  }

  @Get('friends/requests')
  getFriendRequests(@CurrentUser() user: JwtUser) {
    return this.usersService.getFriendRequests(user.id);
  }

  @Post('friends/:addresseeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendFriendRequest(@CurrentUser() user: JwtUser, @Param('addresseeId') addresseeId: string) {
    return this.usersService.sendFriendRequest(user.id, addresseeId);
  }

  @Put('friends/:requesterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  acceptFriendRequest(@CurrentUser() user: JwtUser, @Param('requesterId') requesterId: string) {
    return this.usersService.acceptFriendRequest(user.id, requesterId);
  }

  @Delete('friends/:addresseeId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelFriendRequest(@CurrentUser() user: JwtUser, @Param('addresseeId') addresseeId: string) {
    return this.usersService.cancelFriendRequest(user.id, addresseeId);
  }

  @Delete('friends/:requesterId/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFriendRequest(@CurrentUser() user: JwtUser, @Param('requesterId') requesterId: string) {
    return this.usersService.deleteFriendRequest(user.id, requesterId);
  }
}
