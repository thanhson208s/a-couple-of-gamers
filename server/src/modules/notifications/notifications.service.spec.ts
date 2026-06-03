import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FIREBASE_MSG } from '../../common/firebase/firebase.module';
import { mockRepository } from '../../common/helpers/test.helper';
import { FcmToken } from './fcm-token.entity';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let remindersQueue: { add: jest.Mock; remove: jest.Mock };
  let messaging: { sendEachForMulticast: jest.Mock };
  let fcmTokens: ReturnType<typeof mockRepository<FcmToken>> & { createQueryBuilder: jest.Mock };
  let queryBuilder: {
    insert: jest.Mock;
    values: jest.Mock;
    orUpdate: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    remindersQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    messaging = {
      sendEachForMulticast: jest.fn().mockResolvedValue({ responses: [] }),
    };
    queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    fcmTokens = Object.assign(mockRepository<FcmToken>(), {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getQueueToken('reminders'), useValue: remindersQueue },
        { provide: FIREBASE_MSG, useValue: messaging },
        { provide: getRepositoryToken(FcmToken), useValue: fcmTokens },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('sendPush', () => {
    it('does nothing when the user has no registered devices', async () => {
      fcmTokens.find.mockResolvedValue([]);

      await service.sendPush('USER000001', 'instant-reminder', { matchId: 'match-1' });

      expect(fcmTokens.find).toHaveBeenCalledWith({ where: { userId: 'USER000001' } });
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
      expect(fcmTokens.delete).not.toHaveBeenCalled();
    });

    it('sends the default notification content to every registered token', async () => {
      fcmTokens.find.mockResolvedValue([
        { userId: 'USER000001', token: 'token-1' },
        { userId: 'USER000001', token: 'token-2' },
      ] as FcmToken[]);
      messaging.sendEachForMulticast.mockResolvedValue({
        responses: [{ success: true }, { success: true }],
      });

      await service.sendPush('USER000001', 'instant-reminder', { matchId: 'match-1' });

      expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
        tokens: ['token-1', 'token-2'],
        data: { type: 'instant-reminder', matchId: 'match-1' },
        notification: {
          title: "It's your turn!",
          body: "Your opponent just made a move. Don't keep them waiting!",
        },
      });
      expect(fcmTokens.delete).not.toHaveBeenCalled();
    });

    it('uses custom notification content when provided', async () => {
      fcmTokens.find.mockResolvedValue([{ userId: 'USER000001', token: 'token-1' }] as FcmToken[]);
      messaging.sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });

      await service.sendPush(
        'USER000001',
        'friend-invite',
        { inviteCode: 'ABCD1234' },
        { title: 'Alice invited you', body: 'Join Tic-Tac-Toe' },
      );

      expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
        tokens: ['token-1'],
        data: { type: 'friend-invite', inviteCode: 'ABCD1234' },
        notification: { title: 'Alice invited you', body: 'Join Tic-Tac-Toe' },
      });
    });

    it('deletes only tokens Firebase reports as unregistered', async () => {
      fcmTokens.find.mockResolvedValue([
        { userId: 'USER000001', token: 'valid-token' },
        { userId: 'USER000001', token: 'stale-token' },
        { userId: 'USER000001', token: 'temporary-error-token' },
      ] as FcmToken[]);
      messaging.sendEachForMulticast.mockResolvedValue({
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
          {
            success: false,
            error: { code: 'messaging/unavailable' },
          },
        ],
      });

      await service.sendPush('USER000001', 'delayed-reminder', { matchId: 'match-1' });

      expect(fcmTokens.delete).toHaveBeenCalledTimes(1);
      expect(fcmTokens.delete).toHaveBeenCalledWith({
        token: 'stale-token',
        userId: 'USER000001',
      });
    });
  });

  describe('scheduleReminders', () => {
    it('resets existing reminder jobs before adding new ones', async () => {
      await service.scheduleReminders('match-1', 'OPPONENT01');

      expect(remindersQueue.remove).toHaveBeenCalledWith('instant-reminder:match-1:OPPONENT01');
      expect(remindersQueue.remove).toHaveBeenCalledWith('delayed-reminder:match-1:OPPONENT01');
      expect(remindersQueue.remove).toHaveBeenCalledTimes(2);
      expect(remindersQueue.add).toHaveBeenCalledTimes(2);
      expect(remindersQueue.remove.mock.invocationCallOrder[1]).toBeLessThan(
        remindersQueue.add.mock.invocationCallOrder[0],
      );
    });

    it('adds instant and delayed reminder jobs with stable job ids and delays', async () => {
      await service.scheduleReminders('match-1', 'OPPONENT01');

      expect(remindersQueue.add).toHaveBeenCalledWith(
        'instant-reminder',
        { matchId: 'match-1', opponentId: 'OPPONENT01' },
        { delay: 5 * 60 * 1000, jobId: 'instant-reminder:match-1:OPPONENT01' },
      );
      expect(remindersQueue.add).toHaveBeenCalledWith(
        'delayed-reminder',
        { matchId: 'match-1', opponentId: 'OPPONENT01' },
        { delay: 24 * 60 * 60 * 1000, jobId: 'delayed-reminder:match-1:OPPONENT01' },
      );
    });
  });

  describe('cancelReminders', () => {
    it('removes both reminder jobs for the match and opponent', async () => {
      await service.cancelReminders('match-1', 'OPPONENT01');

      expect(remindersQueue.remove).toHaveBeenCalledWith('instant-reminder:match-1:OPPONENT01');
      expect(remindersQueue.remove).toHaveBeenCalledWith('delayed-reminder:match-1:OPPONENT01');
      expect(remindersQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('upsertFcmToken', () => {
    it('inserts or updates a token by its token primary key', async () => {
      await service.upsertFcmToken('USER000001', 'token-1', 'ios');

      expect(fcmTokens.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(queryBuilder.insert).toHaveBeenCalledTimes(1);
      expect(queryBuilder.values).toHaveBeenCalledWith({
        token: 'token-1',
        userId: 'USER000001',
        platform: 'ios',
      });
      expect(queryBuilder.orUpdate).toHaveBeenCalledWith(
        ['user_id', 'platform', 'updated_at'],
        ['token'],
      );
      expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteFcmToken', () => {
    it('deletes the user token pair', async () => {
      await service.deleteFcmToken('USER000001', 'token-1');

      expect(fcmTokens.delete).toHaveBeenCalledWith({
        token: 'token-1',
        userId: 'USER000001',
      });
    });
  });
});
