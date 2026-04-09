import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotImplementedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { GamesService } from '../games/games.service';
import { PluginRegistry } from '../games/plugin.registry';
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
    private readonly pluginRegistry: PluginRegistry,
  ) {}

  async createMatch(gameSlug: string, playerSlot: 1 | 2, callerId: string): Promise<object> {
    const game = await this.gamesService.findBySlug(gameSlug);
    if (!game) throw new NotFoundException(`Game not found: ${gameSlug}`);

    try {
      this.pluginRegistry.get(game.slug);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const inviteCode = generateInviteCode();
    const inviteCodeExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const match = this.matches.create({
      game,
      status: 'pending',
      state: {},
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

    const plugin = this.pluginRegistry.get(match.game.slug);
    const state = plugin.initialState([player1Id, player2Id]);

    match.status = 'active';
    match.player1Id = player1Id;
    match.player2Id = player2Id;
    match.state = state;
    match.inviteCode = null;
    match.inviteCodeExpiresAt = null;
    match.currentTurn = 1;

    return this.matches.save(match);
  }

  async listMatches(userId: string) {
    const now = new Date();
    const inactivityCutoff = new Date(now.getTime() - INACTIVITY_TTL_MS);

    return this.matches.find({
      where: [
        { player1Id: userId, status: 'pending', inviteCodeExpiresAt: MoreThan(now) },
        { player2Id: userId, status: 'pending', inviteCodeExpiresAt: MoreThan(now) },
        { player1Id: userId, status: 'active',  updatedAt: MoreThan(inactivityCutoff) },
        { player2Id: userId, status: 'active',  updatedAt: MoreThan(inactivityCutoff) },
      ],
    });
  }

  async getMatch(_id: string) {
    throw new Error('not implemented');
  }

  async abandonMatch(_id: string) {
    throw new Error('not implemented');
  }

  async submitMove(_matchId: string, _move: unknown) {
    throw new Error('not implemented');
  }

  async completeAiMatch(_matchId: string, _winnerId: string | null) {
    throw new Error('not implemented');
  }

  async getInvite(_matchId: string) {
    throw new Error('not implemented');
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
