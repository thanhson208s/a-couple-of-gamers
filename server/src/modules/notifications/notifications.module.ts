import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'notifications' },
      { name: 'reminders' },
    ),
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
