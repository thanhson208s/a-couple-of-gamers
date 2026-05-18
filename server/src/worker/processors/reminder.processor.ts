import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
// import { NotificationsService } from '../../modules/notifications/notifications.service';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  constructor(/* private readonly notificationsService: NotificationsService */) {
    super();
  }

  async process(_job: Job<{ matchId: string; opponentId: string }>): Promise<void> {
    // const { matchId, opponentId } = job.data;
    
    // await this.notificationsService.sendPush(opponentId, job.name, { matchId });
  }
}
