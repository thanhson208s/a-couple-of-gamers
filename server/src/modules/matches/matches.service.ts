import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotImplementedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import type { GameState } from '../../logic';
import { GamesService } from '../games/games.service';
import { GamesRegistry } from '../games/games.registry';
import { Match } from './match.entity';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INVITE_TTL_S = 86_400;
const INACTIVITY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ABANDONMENT_TTL_MS = 24 * 60 * 60 * 1000; // 1 days
const INVITE_CODE_CHARSET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base57, no ambiguous chars
const INVITE_CODE_LENGTH = 8;

interface PendingMatchData {
  gameId: string;
  gameSlug: string;
  playerSlot: 1 | 2;
  playerId: string;
  inviteCode: string;
  options: Record<string, unknown> | null;
  createdAt: string;
}

function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => INVITE_CODE_CHARSET[b % INVITE_CODE_CHARSET.length])
    .join('');
}

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    private readonly gamesService: GamesService,
    private readonly gamesRegistry: GamesRegistry,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async createMatch(gameSlug: string, playerSlot: 1 | 2, callerId: string, options?: Record<string, unknown>): Promise<object> {
    const game = await this.gamesService.findBySlug(gameSlug);
    if (!game) throw new NotFoundException(`Game not found: ${gameSlug}`);

    try {
      this.gamesRegistry.get(game.slug);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const data: PendingMatchData = {
      gameId: game.id,
      gameSlug: game.slug,
      playerSlot,
      playerId: callerId,
      inviteCode,
      options: options ?? null,
      createdAt: new Date().toISOString(),
    };

    await this.redis.set(`pending_matches:invite:${inviteCode}`, JSON.stringify(data), 'EX', INVITE_TTL_S);
    await this.redis.zadd(`pending_matches:user:${callerId}`, expiresAt.getTime(), inviteCode);

    return {
      inviteCode,
      deepLink: `acog://join?code=${inviteCode}`,
      expiresAt,
    };
  }

  async joinMatch(inviteCode: string, callerId: string): Promise<Match> {
    const raw = await this.redis.get(`pending_matches:invite:${inviteCode}`);
    if (!raw) throw new NotFoundException('Invite code not found');

    const data: PendingMatchData = JSON.parse(raw);

    if (data.playerId === callerId) {
      throw new ForbiddenException('Cannot join your own match');
    }

    await this.redis.del(`pending_matches:invite:${inviteCode}`);
    await this.redis.zrem(`pending_matches:user:${data.playerId}`, inviteCode);

    const plugin = this.gamesRegistry.get(data.gameSlug);
    const state = plugin.initialState(data.options ?? undefined);

    const player1Id = data.playerSlot === 1 ? data.playerId : callerId;
    const player2Id = data.playerSlot === 2 ? data.playerId : callerId;

    const match = this.matches.create({
      game: { id: data.gameId } as any,
      status: 'active',
      state,
      options: data.options,
      player1Id,
      player2Id,
      currentTurn: 1,
    });

    return this.matches.save(match);
  }

  async cancelMatch(inviteCode: string, callerId: string): Promise<void> {
    const raw = await this.redis.get(`pending_matches:invite:${inviteCode}`);
    if (!raw) throw new NotFoundException('Invite code not found');

    const data: PendingMatchData = JSON.parse(raw);

    if (data.playerId !== callerId) {
      throw new ForbiddenException('Only the creator can cancel this match');
    }

    await this.redis.del(`pending_matches:invite:${inviteCode}`);
    await this.redis.zrem(`pending_matches:user:${callerId}`, inviteCode);
  }

  async abandonMatch(id: string, callerId: string): Promise<void> {
    const match = await this.matches.findOne({ where: { id } });
    if (!match) throw new NotFoundException('Match not found');

    if (match.player1Id !== callerId && match.player2Id !== callerId) {
      throw new ForbiddenException('You are not a player in this match');
    }

    match.status = 'abandoned';
    await this.matches.save(match);
  }

  async listPendingMatches(userId: string): Promise<object[]> {
    const now = new Date();
    await this.redis.zremrangebyscore(`pending_matches:user:${userId}`, '-inf', now.getTime());
    const inviteCodes = await this.redis.zrange(`pending_matches:user:${userId}`, 0, -1);
    if (inviteCodes.length === 0) return [];

    const raws = await this.redis.mget(...inviteCodes.map((c) => `pending_matches:invite:${c}`));
    return raws
      .filter((r): r is string => r !== null)
      .map((r) => {
        const d: PendingMatchData = JSON.parse(r);
        return {
          status: 'pending' as const,
          inviteCode: d.inviteCode,
          deepLink: `acog://join?code=${d.inviteCode}`,
          expiresAt: new Date(new Date(d.createdAt).getTime() + INVITE_TTL_MS),
          playerSlot: d.playerSlot,
          gameSlug: d.gameSlug,
          createdAt: new Date(d.createdAt),
        };
      });
  }

  async listActiveMatches(userId: string): Promise<Match[]> {
    const inactivityCutoff = new Date(Date.now() - INACTIVITY_TTL_MS);
    return this.matches.find({
      where: [
        { player1Id: userId, status: 'active', updatedAt: MoreThan(inactivityCutoff) },
        { player2Id: userId, status: 'active', updatedAt: MoreThan(inactivityCutoff) },
      ],
    });
  }

  async listCompletedMatches(userId: string): Promise<Match[]> {
    return this.matches.find({
      where: [
        { player1Id: userId, status: 'completed' },
        { player2Id: userId, status: 'completed' },
      ],
      order: { updatedAt: 'DESC' },
      skip: 0,
      take: 10,
    });
  }

  async submitMove(_matchId: string, _move: unknown) {
    throw new Error('not implemented');
  }

  // ---
  // Match state cache (Redis key: match:state:{matchId}, TTL: sliding 1 h)
  // Redis is the fast path; Postgres is flushed at session boundaries (game over, close_match, disconnect).
  // See: docs/game-system.md#match-state-cache

  private async getStateFromCache(_matchId: string): Promise<GameState> {
    throw new NotImplementedException();
  }

  private async persistState(_matchId: string, _state: GameState): Promise<void> {
    throw new NotImplementedException();
  }

  private async clearStateFromCache(_matchId: string): Promise<void> {
    throw new NotImplementedException();
  }

  async cleanupStaleMatches(): Promise<void> {
    const now = new Date();

    await this.matches.delete({
      status: 'abandoned',
      updatedAt: LessThanOrEqual(new Date(now.getTime() - ABANDONMENT_TTL_MS)),
    });

    await this.matches.delete({
      status: 'active',
      updatedAt: LessThanOrEqual(new Date(now.getTime() - INACTIVITY_TTL_MS)),
    });
  }

  async devForceComplete(_matchId: string, _winner: 0 | 1 | 2): Promise<void> {
    throw new NotImplementedException();
  }
}
