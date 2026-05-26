import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { Game, GameType } from '../games/game.entity';
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';
import { auth } from 'firebase-admin';
import { UserRival } from './user-rival.entity';
import { FriendStatus, UserFriend } from './user-friend.entity';
import { WsGateway } from '../ws/ws.gateway';
import { ConfigService } from '../config/config.service';

@Injectable()
export class UsersService {
  private readonly cleanupCallbacks: ((userId: string) => Promise<void>)[] = [];

  registerCleanupCallback(fn: (userId: string) => Promise<void>): void {
    this.cleanupCallbacks.push(fn);
  }

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserFavorite) private readonly userFavorites: Repository<UserFavorite>,
    @InjectRepository(UserRival) private readonly userRivals: Repository<UserRival>,
    @InjectRepository(Game) private readonly games: Repository<Game>,
    @InjectRepository(UserFriend) private readonly userFriends: Repository<UserFriend>,
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: auth.Auth,
    private readonly wsGateway: WsGateway,
    private readonly configService: ConfigService,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findOrUpsertByFirebaseUid(uid: string, provider: string, displayName?: string, email?: string, avatarUrl?: string | null): Promise<User> {
    let user = await this.users.findOne({ where: { providerId: uid }});
    if (user) {
      if (user.provider === provider) return user;
      user.provider = provider;
      if (!['anonymous', 'password', 'dev'].includes(provider)) {
        if (displayName !== undefined) user.displayName = displayName;
        if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
      }
    } else {
      const id = await this.generateId();
      if (!displayName)
        displayName = email ? email.split('@')[0] : 'Gamer' + id;
      user = this.users.create({ id, provider, providerId: uid, displayName, avatarUrl: avatarUrl ?? null });
    }

    return await this.users.save(user);
  }

  async findOrCreate(provider: string, providerId: string, displayName: string): Promise<User> {
    let user = await this.users.findOne({ where: { providerId } });
    if (!user) {
      const id = await this.generateId();
      user = await this.users.save(this.users.create({ id, provider, providerId, displayName }));
    }
    return user;
  }

  private async generateId(): Promise<string> {
    const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = Array.from(
        { length: 10 },
        () => CHARSET[randomInt(0, CHARSET.length)],
      ).join('');
      if (!(await this.users.existsBy({ id }))) return id;
    }
    throw new InternalServerErrorException('Failed to generate unique user ID after 5 attempts');
  }

  async getProfile(userId: string): Promise<{ id: string; provider: string; displayName: string; avatarUrl: string | null; favorites: string[]; favoritesLimit: number }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const favs = await this.userFavorites.find({ where: { userId }, relations: ['game'] });
    const favoritesLimit = this.getFavoriteLimit(user.provider);
    return { id: user.id, provider: user.provider, displayName: user.displayName, avatarUrl: user.avatarUrl, favorites: favs.map(f => f.game.id), favoritesLimit };
  }

  async deleteAccount(userId: string, idToken: string): Promise<void> {
    const FRESH_PERIOD = 300; //seconds
    try {
      const decodedIdToken = await this.firebaseAuth.verifyIdToken(idToken, true);
      if (decodedIdToken.iat + FRESH_PERIOD < Math.floor(Date.now() / 1000))
        throw new UnauthorizedException();

      const user = await this.users.findOne({ where: { providerId: decodedIdToken.uid }});
      if (!user) {
        await this.firebaseAuth.deleteUser(decodedIdToken.uid);
        throw new UnauthorizedException();
      }
      if (user.id !== userId)
        throw new UnauthorizedException();

      for (const cleanup of this.cleanupCallbacks) await cleanup(userId);
      await this.users.delete(user.id);
      await this.firebaseAuth.deleteUser(decodedIdToken.uid);
    } catch(e) {
      throw new UnauthorizedException();
    }
  }

  async addFavorite(userId: string, gameId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const gameExists = await this.games.existsBy({ id: gameId });
    if (!gameExists) throw new NotFoundException();
    const existing = await this.userFavorites.findOne({ where: { userId, gameId } });
    if (existing) return;

    const limit = this.getFavoriteLimit(user.provider);
    const count = await this.userFavorites.count({ where: { userId } });
    if (limit >= 0 && count >= limit) throw new ForbiddenException();
    await this.userFavorites.save(this.userFavorites.create({ userId, gameId }));
  }

  async removeFavorite(userId: string, gameId: string): Promise<void> {
    await this.userFavorites.delete({ userId, gameId });
  }

  async updateRival(player1Id: string, player2Id: string, gameId: string, winner: 0 | 1 | 2, gameType: GameType): Promise<void> {
    let p1Col: string;
    let p2Col: string;
    if (gameType === GameType.Coop) {
      p1Col = p2Col = winner === 1 ? 'winCount' : 'lossCount';
    } else if (winner === 0) {
      p1Col = p2Col = 'drawCount';
    } else if (winner === 1) {
      p1Col = 'winCount'; p2Col = 'lossCount';
    } else if (winner === 2) {
      p1Col = 'lossCount'; p2Col = 'winCount';
    }

    await this.dataSource.transaction(async (em: EntityManager) => {
      const rivals = em.getRepository(UserRival);
      for (const [uid1, uid2] of [[player1Id, player2Id], [player2Id, player1Id]] as [string, string][]) {
        if (!(await rivals.existsBy({ userId1: uid1, userId2: uid2, gameId }))) {
          await rivals.save(rivals.create({ userId1: uid1, userId2: uid2, gameId }));
        }
      }
      await rivals.increment({ userId1: player1Id, userId2: player2Id, gameId }, p1Col, 1);
      await rivals.increment({ userId1: player2Id, userId2: player1Id, gameId }, p2Col, 1);
    });
  }

  async getStats(userId: string): Promise<{ gameId: string; matchCount: number; winCount: number; lossCount: number; drawCount: number }[]> {
    const rivals = await this.userRivals.find({ where: { userId1: userId } });

    const statsMap = new Map<string, { matchCount: number; winCount: number; lossCount: number; drawCount: number }>();
    for (const rival of rivals) {
      const s = statsMap.get(rival.gameId) ?? { matchCount: 0, winCount: 0, lossCount: 0, drawCount: 0 };
      statsMap.set(rival.gameId, {
        matchCount: s.matchCount + rival.matchCount,
        winCount:   s.winCount   + rival.winCount,
        lossCount:  s.lossCount  + rival.lossCount,
        drawCount:  s.drawCount  + rival.drawCount,
      });
    }

    return [...statsMap.entries()].map(([gameId, s]) => ({ gameId, ...s }));
  }

  async getRival(userId: string, opponentId: string): Promise<UserRival[]> {
    return this.userRivals.find({ where: { userId1: userId, userId2: opponentId } });
  }

  private getFavoriteLimit(provider: string): number {
    const { featureLimits } = this.configService.configData;
    if (provider === 'anonymous') return featureLimits.anonymous.maxFavorites;
    if (provider === 'dev') return featureLimits.dev.maxFavorites;
    return featureLimits.social.maxFavorites;
  }

  private getFriendLimit(provider: string): number {
    const { featureLimits } = this.configService.configData;
    if (provider === 'anonymous') return featureLimits.anonymous.maxFriends;
    if (provider === 'dev') return featureLimits.dev.maxFriends;
    return featureLimits.social.maxFriends;
  }

  private countFriends(userId: string): Promise<number> {
    return this.userFriends.count({
      where: [{ requesterId: userId }, { addresseeId: userId }],
    });
  }

  async sendFriendRequest(userId: string, addresseeId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.provider === 'anonymous')
      throw new ForbiddenException('Guests can not add friends');

    if (userId === addresseeId)
      throw new BadRequestException('Can not befriend yourself');

    const addressee = await this.users.findOne({ where: { id: addresseeId } });
    if (!addressee) throw new NotFoundException('Friend does not exist');

    const [senderCount, addresseeCount] = await Promise.all([
      this.countFriends(userId),
      this.countFriends(addresseeId),
    ]);

    const senderLimit = this.getFriendLimit(user.provider);
    const addresseeLimit = this.getFriendLimit(addressee.provider);

    if (senderLimit >= 0 && senderCount >= senderLimit)
      throw new ForbiddenException('Friend limit reached');
    if (addresseeLimit >= 0 && addresseeCount >= addresseeLimit)
      throw new ForbiddenException('This person has reached their friend limit');

    const row = await this.userFriends.findOne({
      where: [
        { requesterId: userId, addresseeId },
        { requesterId: addresseeId, addresseeId: userId },
      ],
    });
    if (row) throw new ConflictException("Friend request is already sent");

    await this.userFriends.save(this.userFriends.create({ requesterId: userId, addresseeId }));

    this.wsGateway.sendToUser(addresseeId, 'friend:request', { userId, displayName: user.displayName, avatarUrl: user.avatarUrl });
  }

  async cancelFriendRequest(userId: string, addresseeId: string): Promise<void> {
    await this.userFriends.delete({ requesterId: userId, addresseeId, status: FriendStatus.Pending });
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<void> {
    const row = await this.userFriends.findOne({
      where: { requesterId, addresseeId: userId, status: FriendStatus.Pending },
      relations: ['addressee']
    });
    if (!row) throw new NotFoundException('Friend request not found');

    row.status = FriendStatus.Accepted;
    await this.userFriends.save(row);

    this.wsGateway.sendToUser(requesterId, 'friend:accept', { userId, displayName: row.addressee.displayName, avatarUrl: row.addressee.avatarUrl});
  }

  async deleteFriendRequest(userId: string, requesterId: string): Promise<void> {
    await this.userFriends.delete({ requesterId, addresseeId: userId, status: FriendStatus.Pending });
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await this.userFriends.delete({ requesterId: userId, addresseeId: friendId, status: FriendStatus.Accepted });
    await this.userFriends.delete({ requesterId: friendId, addresseeId: userId, status: FriendStatus.Accepted });
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    return this.userFriends.existsBy([
      { requesterId: userId1, addresseeId: userId2, status: FriendStatus.Accepted },
      { requesterId: userId2, addresseeId: userId1, status: FriendStatus.Accepted },
    ]);
  }

  async getFriendList(userId: string): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
    return this.userFriends
      .createQueryBuilder('uf')
      .innerJoin('uf.requester', 'r')
      .innerJoin('uf.addressee', 'a')
      .select(`CASE WHEN uf.requester_id = :me THEN a.id ELSE r.id END`, 'id')
      .addSelect(`CASE WHEN uf.requester_id = :me THEN a.display_name ELSE r.display_name END`, 'displayName')
      .addSelect(`CASE WHEN uf.requester_id = :me THEN a.avatar_url ELSE r.avatar_url END`, 'avatarUrl')
      .where('uf.status = :status', { status: FriendStatus.Accepted })
      .andWhere('(uf.requester_id = :me OR uf.addressee_id = :me)', { me: userId })
      .getRawMany<{ id: string; displayName: string; avatarUrl: string | null }>();
  }

  async getFriendRequests(userId: string) {
    const requests = await this.userFriends.find({
      where: [
        {requesterId: userId, status: FriendStatus.Pending },
        {addresseeId: userId, status: FriendStatus.Pending },
      ],
      relations: ['requester', 'addressee'],
      select: {
        requesterId: true,
        addresseeId: true,
        requester: {
          id: true,
          displayName: true,
          avatarUrl: true
        },
        addressee: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      }
    });

    return requests.reduce((acc, req) => {
      if (req.requesterId === userId) {
        acc.sent.push({
          friendId: req.addressee.id,
          displayName: req.addressee.displayName,
          avatarUrl: req.addressee.avatarUrl,
        });
      } else {
        acc.received.push({
          friendId: req.requester.id,
          displayName: req.requester.displayName,
          avatarUrl: req.requester.avatarUrl,
        });
      }

      return acc;
    }, {
      sent: [] as {friendId: string, displayName: string, avatarUrl: string | null}[],
      received: [] as {friendId: string, displayName: string, avatarUrl: string | null}[],
    });
  }
}
