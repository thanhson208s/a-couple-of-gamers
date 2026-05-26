import { Controller, Put, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../../common/guards/jwt-auth.guard';
import { DeleteFcmTokenDto, UpsertFcmTokenDto } from './fcm-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Put('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  upsertDeviceToken(@CurrentUser() user: JwtUser, @Body() dto: UpsertFcmTokenDto) {
    return this.notificationsService.upsertFcmToken(user.id, dto.token, dto.platform);
  }

  @Delete('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDeviceToken(@CurrentUser() user: JwtUser, @Body() dto: DeleteFcmTokenDto) {
    return this.notificationsService.deleteFcmToken(user.id, dto.token);
  }
}
