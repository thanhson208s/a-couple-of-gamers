import { Controller, Put, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class UsersController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Put('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  upsertDeviceToken(@CurrentUser() user: JwtUser, @Body() body: { token: string; platform: string }) {
    return this.notificationsService.upsertFcmToken(user.id, body.token, body.platform);
  }

  @Delete('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDeviceToken(@CurrentUser() user: JwtUser, @Body() body: { token: string }) {
    return this.notificationsService.deleteFcmToken(user.id, body.token);
  }
}
