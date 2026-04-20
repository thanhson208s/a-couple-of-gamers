import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

// Short-delay job: dispatches a move notification FCM push to the opponent
// when they haven't opened the match within the grace window.
// Enqueued by: NotificationsService after each move (when opponent not viewing).
// Cancelled by: NotificationsService on open_match if the job hasn't fired yet.
@Processor('notifications')
export class NotifyProcessor extends WorkerHost {
  async process(_job: Job) {
    // TODO: check opponent is still not viewing the match, then send FCM push via NotificationsService
    throw new Error('not implemented');
  }
}
