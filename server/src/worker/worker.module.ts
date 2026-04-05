import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReminderProcessor } from './processors/reminder.processor';
import { CleanupProcessor } from './processors/cleanup.processor';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL },
    }),
    BullModule.registerQueue(
      { name: 'reminders' },
      { name: 'cleanup' },
    ),
  ],
  providers: [ReminderProcessor, CleanupProcessor],
})
export class WorkerModule {}
