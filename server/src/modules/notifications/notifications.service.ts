import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { messaging } from 'firebase-admin';
import { FIREBASE_MSG } from '../../common/firebase/firebase.module';
import { FcmToken } from './fcm-token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

const INSTANT_REMINDER_MS = 5 * 60 * 1000;
const DELAYED_REMINDER_MS = 24 * 60 * 60 * 1000;

const NOTIFICATION_CONTENT: Record<string, { title: string; body: string }> = {
  'instant-reminder': { title: "It's your turn!", body: "Your opponent just made a move. Don't keep them waiting!" },
  'delayed-reminder': { title: 'Still your turn', body: "It's been a while — your opponent is waiting for your move." },
  'friend-invite': { title: 'Match Invitation', body: 'A friend invited you to a match!' },
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('reminders') private readonly remindersQueue: Queue,
    @Inject(FIREBASE_MSG) private readonly messaging: messaging.Messaging,
    @InjectRepository(FcmToken) private readonly fcmTokens: Repository<FcmToken>,
  ) {}

  async sendPush(userId: string, type: string, payload: Record<string, string>, notification?: { title: string, body: string } ): Promise<void> {
    const devices = await this.fcmTokens.find({ where: { userId } });
    if (devices.length === 0) return;

    const tokens = devices.map(d => d.token);
    const result = await this.messaging.sendEachForMulticast({
      tokens,
      data: { type, ...payload },
      notification: notification ?? NOTIFICATION_CONTENT[type],
    });

    for (let i = 0; i < result.responses.length; i++) {
      if (!result.responses[i].success && result.responses[i].error?.code === 'messaging/registration-token-not-registered') {
        await this.fcmTokens.delete({ token: tokens[i], userId });
      }
    }
  }

  // Enqueue both reminder jobs for the opponent. Both are cancelled together
  // (via cancelReminders) when the opponent opens the match or makes a move.
  async scheduleReminders(matchId: string, opponentId: string) {
    await this.cancelReminders(matchId, opponentId); // reset timers
    await Promise.all([
      this.remindersQueue.add('instant-reminder', { matchId, opponentId }, { delay: INSTANT_REMINDER_MS, jobId: `instant-reminder:${matchId}:${opponentId}` }),
      this.remindersQueue.add('delayed-reminder', { matchId, opponentId }, { delay: DELAYED_REMINDER_MS, jobId: `delayed-reminder:${matchId}:${opponentId}` }),
    ]);
  }

  async cancelReminders(matchId: string, opponentId: string) {
    await Promise.all([
      this.remindersQueue.remove(`instant-reminder:${matchId}:${opponentId}`),
      this.remindersQueue.remove(`delayed-reminder:${matchId}:${opponentId}`),
    ]);
  }

  async upsertFcmToken(userId: string, token: string, platform: string): Promise<void> {
    await this.fcmTokens
      .createQueryBuilder()
      .insert()
      .values({ token, userId, platform })
      .orUpdate(['user_id', 'platform', 'updated_at'], ['token'])
      .execute();
  }

  async deleteFcmToken(userId: string, token: string): Promise<void> {
    await this.fcmTokens.delete({ token, userId });
  }
}
