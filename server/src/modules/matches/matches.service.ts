import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotImplementedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import type {GameMove, GameAction, GameState, GameView } from '../../logic';
import { GamesService } from '../games/games.service';
import { GamesRegistry } from '../games/games.registry';
import { WsGateway } from '../ws/ws.gateway';
import { Match, MatchStatus } from './match.entity';
import { OnWsDisconnected, OnWsMessage } from '../ws/ws.decorators';
import { SubmitActionDto } from './submit-action.dto';

const META_TTL_MS = 24 * 60 * 60 * 1000; // 1 days
const INACTIVITY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ABANDONMENT_TTL_MS = 24 * 60 * 60 * 1000; // 1 days
const REPLAY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MATCH_STATE_TTL_MS = 60 * 60 * 1000; // 1 hours
const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INVITE_CODE_CHARSET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base57, no ambiguous chars
const INVITE_CODE_LENGTH = 8;

interface MatchMeta {
  player1Id: string;
  player2Id: string;
  gameId: string;
  status: string;
}

interface MatchInvite {
  gameId: string;
  playerSlot: 1 | 2;
  playerId: string;
  inviteCode: string;
  options: Record<string, unknown> | null;
  createdAt: string;
}

interface MatchStep {
  move: GameMove;
  view: GameView;
  playerIndex: number;
}

interface MatchReplay {
  initialView: GameView;
  steps: MatchStep[];
}

function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => INVITE_CODE_CHARSET[b % INVITE_CODE_CHARSET.length])
    .join('');
}

function getPlayerIndex(player1Id: string, player2Id: string, userId: string) {
  if (player1Id === userId) return 1;
  if (player2Id === userId) return 2;
  throw new ForbiddenException();
}

function getOpponentId(player1Id: string, player2Id: string, userId: string) {
  if (player1Id === userId) return player2Id;
  if (player2Id === userId) return player1Id;
  throw new ForbiddenException();
}

function errorCodeOf(err: unknown): number {
  if (err instanceof NotFoundException) return 404;
  if (err instanceof ForbiddenException) return 403;
  if (err instanceof BadRequestException) return 400;
  if (err instanceof HttpException) return err.getStatus();
  return 500;
}

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    private readonly gamesService: GamesService,
    private readonly gamesRegistry: GamesRegistry,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly wsGateway: WsGateway,
  ) {}

  async createMatch(gameSlug: string, playerSlot: 1 | 2, callerId: string, options?: Record<string, unknown>): Promise<object> {
    const game = await this.gamesService.findBySlug(gameSlug);
    if (!game) throw new NotFoundException(`Game not found: ${gameSlug}`);

    try {
      this.gamesRegistry.get(game.id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const data: MatchInvite = {
      gameId: game.id,
      playerSlot,
      playerId: callerId,
      inviteCode,
      options: options ?? null,
      createdAt: new Date().toISOString(),
    };

    await this.redis.set(`invite:code:${inviteCode}`, JSON.stringify(data), 'PX', INVITE_TTL_MS);
    await this.redis.zadd(`invite:user:${callerId}`, expiresAt.getTime(), inviteCode);

    return {
      inviteCode,
      deepLink: `acog://join?code=${inviteCode}`,
      expiresAt,
    };
  }

  async joinMatch(inviteCode: string, callerId: string): Promise<void> {
    const raw = await this.redis.get(`invite:code:${inviteCode}`);
    if (!raw) throw new NotFoundException('Invite code not found');

    const data: MatchInvite = JSON.parse(raw);
    if (data.playerId === callerId) {
      throw new ForbiddenException('Cannot join your own match');
    }

    await this.redis.del(`invite:code:${inviteCode}`);
    await this.redis.zrem(`invite:user:${data.playerId}`, inviteCode);

    const plugin = this.gamesRegistry.get(data.gameId);
    const match = await this.matches.save(this.matches.create({
      game: { id: data.gameId } as any,
      status: MatchStatus.Active,
      state: plugin.initialState(data.options ?? undefined),
      options: data.options,
      player1Id: data.playerSlot === 1 ? data.playerId : callerId,
      player2Id: data.playerSlot === 2 ? data.playerId : callerId,
    }));
    const initialView1 = plugin.getPlayerView(match.state as GameState, 1);
    const initialView2 = plugin.getPlayerView(match.state as GameState, 2);

    const meta: MatchMeta = { player1Id: match.player1Id, player2Id: match.player2Id, gameId: data.gameId, status: MatchStatus.Active };
    await this.redis.set(`match:meta:${match.id}`, JSON.stringify(meta), 'PX', INACTIVITY_TTL_MS);

    const matchPayload = {
      id: match.id,
      status: match.status,
      gameId: match.game.id,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
    };
    this.wsGateway.sendToUser(match.player1Id, 'match:start', { inviteCode, initialView: initialView1, match: matchPayload });
    this.wsGateway.sendToUser(match.player2Id, 'match:start', { inviteCode, initialView: initialView2, match: matchPayload });
  }

  async cancelMatch(inviteCode: string, callerId: string): Promise<void> {
    const raw = await this.redis.get(`invite:code:${inviteCode}`);
    if (!raw) throw new NotFoundException('Invite code not found');

    const data: MatchInvite = JSON.parse(raw);

    if (data.playerId !== callerId) {
      throw new ForbiddenException('Only the creator can cancel this match');
    }

    await this.redis.del(`invite:code:${inviteCode}`);
    await this.redis.zrem(`invite:user:${callerId}`, inviteCode);
  }

  async abandonMatch(id: string, callerId: string): Promise<void> {
    const match = await this.matches.findOne({ where: { id } });
    if (!match) throw new NotFoundException('Match not found');

    if (match.player1Id !== callerId && match.player2Id !== callerId) {
      throw new ForbiddenException('You are not a player in this match');
    }

    match.status = MatchStatus.Abandoned;
    await this.matches.save(match);
    await this.flushStateToDB(id);
    await this.clearStateFromCache(id);

    const matchPayload = {
      id: match.id,
      status: match.status,
      state: match.state,
      winner: match.winner,
    };
    this.wsGateway.sendToUser(match.player1Id, 'match:over', { match: matchPayload });
    this.wsGateway.sendToUser(match.player2Id, 'match:over', { match: matchPayload });
  }

  async listPendingMatches(userId: string): Promise<object[]> {
    const now = new Date();
    await this.redis.zremrangebyscore(`invite:user:${userId}`, '-inf', now.getTime());
    const inviteCodes = await this.redis.zrange(`invite:user:${userId}`, 0, -1);
    if (inviteCodes.length === 0) return [];

    const raws = await this.redis.mget(...inviteCodes.map((c) => `invite:code:${c}`));
    return raws.filter((r): r is string => r !== null).map((r) => {
      const d: MatchInvite = JSON.parse(r);
      return {
        status: 'pending',
        inviteCode: d.inviteCode,
        deepLink: `acog://join?code=${d.inviteCode}`,
        expiresAfter: new Date(new Date(d.createdAt).getTime() + INVITE_TTL_MS - now.getTime()),
        playerSlot: d.playerSlot,
        gameId: d.gameId,
        createdAt: new Date(d.createdAt),
      };
    });
  }

  async listActiveMatches(userId: string): Promise<Match[]> {
    const inactivityCutoff = new Date(Date.now() - INACTIVITY_TTL_MS);
    return this.matches.find({
      where: [
        { player1Id: userId, status: MatchStatus.Active, updatedAt: MoreThan(inactivityCutoff) },
        { player2Id: userId, status: MatchStatus.Active, updatedAt: MoreThan(inactivityCutoff) },
      ],
    });
  }

  async listCompletedMatches(userId: string): Promise<Match[]> {
    return this.matches.find({
      where: [
        { player1Id: userId, status: MatchStatus.Completed },
        { player2Id: userId, status: MatchStatus.Completed },
      ],
      order: { updatedAt: 'DESC' },
      skip: 0,
      take: 10,
    });
  }

  async openMatch(matchId: string, callerId: string) {
    const meta = await this.getMatchMeta(matchId);
    if (!meta) throw new NotFoundException('Match not found');
    if (meta.player1Id !== callerId && meta.player2Id !== callerId)
      throw new ForbiddenException('You are not a player in this match');
    
    // If navigating from another match
    const curMatchId = await this.redis.get(`match:user:${callerId}`);
    if (curMatchId) {
      if (curMatchId === matchId) return;
      else {
        await this.flushStateToDB(curMatchId);

        //Notify other player
        const prevOpponentId = getOpponentId(meta.player1Id, meta.player2Id, callerId);
        this.wsGateway.sendToUser(prevOpponentId, 'opponent:disconnected', { matchId: curMatchId, opponentId: callerId });
      }
    }

    const plugin = this.gamesRegistry.get(meta.gameId);
    const playerIndex = getPlayerIndex(meta.player1Id, meta.player2Id, callerId);
    let state;

    if (meta.status === MatchStatus.Active)
      state = await this.getStateFromCache(matchId);
    else {
      const match = await this.matches.findOneOrFail({ where: { id: matchId } });
      state = match.state as GameState;
    }

    await this.redis.set(`match:user:${callerId}`, matchId);

    this.wsGateway.sendToUser(callerId, 'match:open', {
      match: {
        id: matchId,
        status: meta.status,
        gameId: meta.gameId,
        player1Id: meta.player1Id,
        player2Id: meta.player2Id,
      },
      view: plugin.getPlayerView(state, playerIndex!),
      replay: await this.popReplay(matchId, callerId),
    });

    const opponentId = getOpponentId(meta.player1Id, meta.player2Id, callerId);
    this.wsGateway.sendToUser(callerId, 'opponent:connected', { matchId, opponentId });
    this.wsGateway.sendToUser(opponentId, 'opponent:connected', { matchId, opponentId: callerId });
  }

  async closeMatch(matchId: string, callerId: string) {
    const meta = await this.getMatchMeta(matchId);
    if (!meta) throw new NotFoundException('Match not found');
    if (meta.player1Id !== callerId && meta.player2Id !== callerId)
      throw new ForbiddenException('You are not a player in this match');

    const curMatchId = await this.redis.get(`match:user:${callerId}`);
    if (!curMatchId || curMatchId !== matchId) return;

    await this.flushStateToDB(matchId);
    await this.redis.del(`match:user:${callerId}`);

    this.wsGateway.sendToUser(callerId, 'match:close', { matchId });

    const opponentId = getOpponentId(meta.player1Id, meta.player2Id, callerId);
    this.wsGateway.sendToUser(opponentId, 'opponent:disconnected', { matchId, opponentId: callerId });
  }

  async submitAction(matchId: string, callerId: string, action: unknown): Promise<void> {
    const meta = await this.getMatchMeta(matchId);
    if (!meta) throw new NotFoundException('Match not found');
    if (meta.player1Id !== callerId && meta.player2Id !== callerId)
      throw new ForbiddenException('You are not a player in this match');
    if (meta.status !== MatchStatus.Active)
      throw new BadRequestException('Match is not active');

    const curMatchId = await this.redis.get(`match:user:${callerId}`);
    if (!curMatchId || curMatchId !== matchId) return;

    const plugin = this.gamesRegistry.get(meta.gameId);
    const initialState = await this.getStateFromCache(matchId);
    const playerIndex = getPlayerIndex(meta.player1Id, meta.player2Id, callerId);

    let events;
    try {
      events = plugin.applyAction(initialState, action as GameAction, playerIndex!);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    if (events.length === 0) return; // move cached by plugin — no broadcast yet

    const finalState = events[events.length - 1].state;
    await this.persistState(matchId, finalState);

    this.wsGateway.sendToUser(callerId, 'match:moves', {
      matchId,
      steps: events.map(event => ({
        move: event.move,
        view: plugin.getPlayerView(event.state, playerIndex!),
        playerIndex: event.playerIndex,
      })),
    });

    const opponentId = getOpponentId(meta.player1Id, meta.player2Id, callerId);
    const opponentIndex = getPlayerIndex(meta.player1Id, meta.player2Id, opponentId);
    const steps = events.map(event => ({
      move: event.move,
      view: plugin.getPlayerView(event.state, opponentIndex!),
      playerIndex: event.playerIndex
    }));

    const curOpponentMatch = await this.redis.get(`match:user:${opponentId}`);
    if (curOpponentMatch && curOpponentMatch === matchId) {
      this.wsGateway.sendToUser(opponentId, 'match:moves', { matchId, steps });
    } else {
      await this.pushReplay(matchId, plugin.getPlayerView(initialState, opponentIndex!), opponentId, steps);
    }

    if (plugin.isGameOver(finalState)) {
      const match: Match = await this.matches.findOneOrFail({ where: { id: matchId }});

      match.status = MatchStatus.Completed;
      match.winner = plugin.getWinner(finalState);
      match.state = finalState as object;

      await this.matches.save(match);
      await this.clearStateFromCache(matchId);

      const matchPayload = {
        id: match.id,
        status: match.status,
        state: match.state,
        winner: match.winner,
      };
      this.wsGateway.sendToUser(callerId, 'match:over', { match: matchPayload });
      this.wsGateway.sendToUser(opponentId, 'match:over', { match: matchPayload });
    }
  }

  // ---
  // Match state cache (Redis key: match:state:{matchId}, TTL: sliding 1 h)
  // Redis is the fast path; Postgres is flushed at session boundaries (match:over, match:close, disconnect).
  // See: docs/game-system.md#match-state-cache

  async getStateFromCache(matchId: string): Promise<GameState> {
    const raw = await this.redis.get(`match:state:${matchId}`);
    if (raw) return JSON.parse(raw) as GameState;
    const match = await this.matches.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    const state = match.state as GameState;
    await this.redis.set(`match:state:${matchId}`, JSON.stringify(state), 'PX', MATCH_STATE_TTL_MS);
    return state;
  }

  async persistState(matchId: string, state: GameState): Promise<void> {
    await this.redis.set(`match:state:${matchId}`, JSON.stringify(state), 'PX', MATCH_STATE_TTL_MS);
  }

  async flushStateToDB(matchId: string): Promise<void> {
    const raw = await this.redis.get(`match:state:${matchId}`);
    if (!raw) return;
    await this.matches.update({ id: matchId }, { state: JSON.parse(raw) });
  }

  private async getMatchMeta(matchId: string): Promise<MatchMeta | null> {
    const cached = await this.redis.get(`match:meta:${matchId}`);
    if (cached) return JSON.parse(cached) as MatchMeta;
    const match = await this.matches.findOne({ where: { id: matchId }, relations: ['game'] });
    if (!match) return null;
    const meta: MatchMeta = { player1Id: match.player1Id, player2Id: match.player2Id, gameId: match.game.id, status: match.status };
    await this.redis.set(`match:meta:${matchId}`, JSON.stringify(meta), 'PX', meta.status === MatchStatus.Active ? META_TTL_MS : INACTIVITY_TTL_MS);
    return meta;
  }

  private async clearStateFromCache(matchId: string): Promise<void> {
    await this.redis.del(`match:state:${matchId}`, `match:meta:${matchId}`);
  }

  async pushReplay(matchId: string, initialView: GameView, userId: string, steps: { move: GameMove, view: GameView, playerIndex: number }[]) {
    if (steps.length === 0) return;

    const replayKey = `match:replay:${matchId}:${userId}`;
    const replayRaw = await this.redis.get(replayKey);

    let replay: MatchReplay;
    if (replayRaw)
      replay = JSON.parse(replayRaw) as MatchReplay;
    else replay = { initialView, steps: [] };
    replay.steps.push(...steps);
    await this.redis.set(replayKey, JSON.stringify(replay), 'PX', REPLAY_TTL_MS);
  }

  async popReplay(matchId: string, userId: string) {
    const replayKey = `match:replay:${matchId}:${userId}`;
    const replayRaw = await this.redis.getdel(replayKey);
    
    if (replayRaw) return JSON.parse(replayRaw) as MatchReplay;
    else return null;
  }

  async cleanupStaleMatches(): Promise<void> {
    const now = new Date();

    const [abandoned, inactive] = await Promise.all([
      this.matches.find({
        where: { status: MatchStatus.Abandoned, updatedAt: LessThanOrEqual(new Date(now.getTime() - ABANDONMENT_TTL_MS)) },
        select: ['id'],
      }),
      this.matches.find({
        where: { status: MatchStatus.Active, updatedAt: LessThanOrEqual(new Date(now.getTime() - INACTIVITY_TTL_MS)) },
        select: ['id'],
      }),
    ]);

    const ids = [...abandoned, ...inactive].map((m) => m.id);
    if (ids.length === 0) return;

    await this.matches.delete(ids);

    const keys = ids.flatMap((id) => [`match:state:${id}`, `match:meta:${id}`]);
    await this.redis.del(...keys);
  }

  async completeMatch(_matchId: string, _winner: 0 | 1 | 2): Promise<void> {
    throw new NotImplementedException();
  }

  @OnWsMessage('match:open')
  async onUserOpenMatch(payload: { userId: string, matchId: string }) {
    try {
      await this.openMatch(payload.matchId, payload.userId);
    } catch (e) {
      this.wsGateway.errorToUser(payload.userId, 'match:open', errorCodeOf(e));
    }
  }

  @OnWsMessage('match:close')
  async onUserCloseMatch(payload: { userId: string, matchId: string }) {
    try {
      await this.closeMatch(payload.matchId, payload.userId);
    } catch (e) {
      this.wsGateway.errorToUser(payload.userId, 'match:close', errorCodeOf(e));
    }
  }

  @OnWsMessage('match:action', SubmitActionDto)
  async onUserSubmitAction(payload: { userId: string } & SubmitActionDto) {
    try {
      await this.submitAction(payload.matchId, payload.userId, payload.action);
    } catch (e) {
      this.wsGateway.errorToUser(payload.userId, 'match:action', errorCodeOf(e));
    }
  }

  @OnWsDisconnected()
  async onUserDisconnected(payload: { userId: string }) {
    const matchId = await this.redis.get(`match:user:${payload.userId}`);
    if (matchId) {
      await this.flushStateToDB(matchId);

      const meta = await this.getMatchMeta(matchId);
      if (!meta) return;

      const opponentId = getOpponentId(meta.player1Id, meta.player2Id, payload.userId);
      this.wsGateway.sendToUser(opponentId, 'opponent:disconnected', { matchId, opponentId: payload.userId });
    }
  }
}
