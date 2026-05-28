import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from '../../modules/notifications/notifications.service';

const REMINDER_JOBS = new Set(['instant-reminder', 'delayed-reminder']);

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<{ matchId: string; opponentId: string }>): Promise<void> {
    if (!REMINDER_JOBS.has(job.name)) return;

    const { matchId, opponentId } = job.data;
    await this.notificationsService.sendPush(opponentId, job.name, { matchId });
  }
}
