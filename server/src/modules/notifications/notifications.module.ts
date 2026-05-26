import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmToken } from './fcm-token.entity';
import { GuardsModule } from '../../common/guards/guards.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'reminders' },
    ),
    TypeOrmModule.forFeature([FcmToken]),
    GuardsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
