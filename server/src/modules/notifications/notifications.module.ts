import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'reminders' },
    ),
    UsersModule,
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
