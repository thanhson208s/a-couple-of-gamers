import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('reminders') private readonly remindersQueue: Queue,
  ) {}

  async sendPush(_userId: string, _type: string, _payload: unknown) {
    throw new Error('not implemented');
  }

  // Enqueue a short-delay move notification for the opponent.
  // Cancelled via cancelNotification if the opponent opens the match first.
  async scheduleNotification(matchId: string, opponentId: string, delayMs: number) {
    const jobId = `notify:${matchId}:${opponentId}`;
    await this.notificationsQueue.add(
      'move-notification',
      { matchId, opponentId },
      { delay: delayMs, jobId },
    );
  }

  async cancelNotification(matchId: string, opponentId: string) {
    const jobId = `notify:${matchId}:${opponentId}`;
    await this.notificationsQueue.remove(jobId);
  }

  async scheduleReminder(matchId: string, opponentId: string, delayMs: number) {
    const jobId = `reminder:${matchId}:${opponentId}`;
    await this.remindersQueue.add(
      'reminder',
      { matchId, opponentId },
      { delay: delayMs, jobId },
    );
  }

  async cancelReminder(matchId: string, playerId: string) {
    const jobId = `reminder:${matchId}:${playerId}`;
    await this.remindersQueue.remove(jobId);
  }
}
