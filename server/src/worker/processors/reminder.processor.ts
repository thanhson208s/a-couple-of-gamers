import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

// Delayed job: dispatches a push notification when it's a player's turn
// and they haven't acted within the reminder threshold.
// Enqueued by: MatchesService after each move, with a configurable delay.
@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  async process(_job: Job) {
    // TODO: send FCM push via NotificationsService
    throw new Error('not implemented');
  }
}
