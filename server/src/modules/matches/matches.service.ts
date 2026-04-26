import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
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
const INACTIVITY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVITE_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base32, no ambiguous chars
const INVITE_CODE_LENGTH = 4;

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
    const inviteCodeExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const match = this.matches.create({
      game,
      status: 'pending',
      state: {},
      options: options ?? null,
      player1Id: playerSlot === 1 ? callerId : null,
      player2Id: playerSlot === 2 ? callerId : null,
      inviteCode,
      inviteCodeExpiresAt,
    });
    const saved = await this.matches.save(match);

    return {
      id: saved.id,
      inviteCode: saved.inviteCode,
      deepLink: `acog://join?code=${saved.inviteCode}`,
      expiresAt: saved.inviteCodeExpiresAt,
    };
  }

  async joinMatch(inviteCode: string, callerId: string): Promise<Match> {
    const match = await this.matches.findOne({ where: { inviteCode }, relations: ['game'] });
    if (!match) throw new NotFoundException('Invite code not found');

    if (match.inviteCodeExpiresAt && match.inviteCodeExpiresAt < new Date()) {
      throw new GoneException('Invite code has expired');
    }
    if (match.status !== 'pending') {
      throw new ConflictException('Match is no longer pending');
    }
    if (match.player1Id === callerId || match.player2Id === callerId) {
      throw new ForbiddenException('Cannot join your own match');
    }

    const player1Id = match.player1Id ?? callerId;
    const player2Id = match.player2Id ?? callerId;

    const plugin = this.gamesRegistry.get(match.game.slug);
    const state = plugin.initialState((match.options as Record<string, unknown>) ?? undefined);

    match.status = 'active';
    match.player1Id = player1Id;
    match.player2Id = player2Id;
    match.state = state;
    match.inviteCode = null;
    match.inviteCodeExpiresAt = null;
    match.currentTurn = 1;

    return this.matches.save(match);
  }

  async listMatches(userId: string, completed: boolean) {
    const now = new Date();
    const inactivityCutoff = new Date(now.getTime() - INACTIVITY_TTL_MS);

    if (!completed) {
      return this.matches.find({    //find all pending and active matches
        where: [
          { player1Id: userId, status: 'pending', inviteCodeExpiresAt: MoreThan(now) },
          { player2Id: userId, status: 'pending', inviteCodeExpiresAt: MoreThan(now) },
          { player1Id: userId, status: 'active',  updatedAt: MoreThan(inactivityCutoff) },
          { player2Id: userId, status: 'active',  updatedAt: MoreThan(inactivityCutoff) },
        ],
      });
    }
    else return this.matches.find({ //find max 10 most recent completed matches
      where: [
        { player1Id: userId, status: 'completed' },
        { player2Id: userId, status: 'completed' }
      ],
      order: {
        updatedAt: 'DESC'
      },
      skip: 0,
      take: 10
    });
  }

  async abandonMatch(id: string) {
    throw new Error('not implemented');
  }

  async submitMove(_matchId: string, _move: unknown) {
    throw new Error('not implemented');
  }

  // ---
  // Match state cache (Redis key: match:state:{matchId}, TTL: sliding 1 h)
  // Redis is the fast path; Postgres is flushed at session boundaries (game over, close_match, disconnect).
  // See: docs/game-system.md#match-state-cache

  // Return the current game state. Reads from Redis; on miss loads from Postgres and repopulates.
  private async getStateFromCache(_matchId: string): Promise<GameState> {
    throw new NotImplementedException();
  }

  // Write state to Redis immediately. Flush to Postgres at session boundary checkpoints.
  private async persistState(_matchId: string, _state: GameState): Promise<void> {
    throw new NotImplementedException();
  }

  // Remove the match state entry from Redis. Call on match completion or abandonment.
  private async clearStateFromCache(_matchId: string): Promise<void> {
    throw new NotImplementedException();
  }

  async cleanupStaleMatches(): Promise<void> {
    const now = new Date();

    // Pending matches with an expired invite code
    await this.matches.delete({
      status: 'pending',
      inviteCodeExpiresAt: LessThanOrEqual(now),
    });

    // Pending or active matches idle beyond the inactivity threshold
    await this.matches.delete({
      status: 'active',
      updatedAt: LessThanOrEqual(new Date(now.getTime() - INACTIVITY_TTL_MS)),
    });
  }

  async devForceComplete(_matchId: string, _winner: 0 | 1 | 2): Promise<void> {
    throw new NotImplementedException();
  }
}
