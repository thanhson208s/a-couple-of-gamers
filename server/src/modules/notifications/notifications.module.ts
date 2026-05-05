import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { UsersModule } from '../users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmToken } from './fcm-token.entity';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'reminders' },
    ),
    TypeOrmModule.forFeature([FcmToken]),
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
