import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { FirebaseModule } from '../common/firebase/firebase.module';
import { getRedisOptions } from '../common/redis/redis.helper';
import { RedisModule } from '../common/redis/redis.module';
import { MatchesModule } from '../modules/matches/matches.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { ReminderProcessor } from './processors/reminder.processor';
import { CleanupProcessor } from './processors/cleanup.processor';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // every 24 hours

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
      autoLoadEntities: true,
    }),
    BullModule.forRoot({
      connection: getRedisOptions({ maxRetriesPerRequest: null }),
    }),
    RedisModule,
    FirebaseModule,
    BullModule.registerQueue(
      { name: 'reminders' },
      { name: 'cleanup' },
    ),
    MatchesModule,
    NotificationsModule,
  ],
  providers: [ReminderProcessor, CleanupProcessor],
})
export class WorkerModule implements OnModuleInit {
  constructor(@InjectQueue('cleanup') private readonly cleanupQueue: Queue) {}

  async onModuleInit() {
    await this.cleanupQueue.add(
      'stale-matches',
      {},
      {
        repeat: { every: CLEANUP_INTERVAL_MS },
      },
    );
  }
}
