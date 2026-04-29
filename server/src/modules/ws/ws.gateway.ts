import { IncomingMessage } from 'http';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';

import { Inject, OnApplicationShutdown } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { MatchesService } from '../matches/matches.service';
import { Match } from '../matches/match.entity';
import type { GameMove, GameView } from '../../logic';
import { AuthService } from '../auth/auth.service';
import { OnEvent } from '@nestjs/event-emitter';

interface AuthedSocket extends WebSocket {
  userId?: string;
}

// Connection URL: wss://<host>/v1/ws?ticket=<ws-ticket>
// User-scoped persistent connection — opened once after login.
// Authentication: one-time WS ticket from POST /v1/auth/ws-ticket
// See: docs/security.md#websocket-authentication
// See: docs/features/match-session.md
@WebSocketGateway({ path: '/v1/ws', server: 'ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  @WebSocketServer()
  server!: Server;

  private maintenanceState: {
    maintenanceTime: string;
    maintenanceDuration: number;
  } | null = null;

  // userId → socket for O(1) targeted sends
  private readonly clientMap = new Map<string, AuthedSocket>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly authService: AuthService,
    private readonly matchesService: MatchesService,
  ) {}

  async setPresence(userId: string, presence: string) {
    await this.redis.set(`ws:user:${userId}`, presence);
  }

  async getPresence(userId: string) {
    return await this.redis.get(`ws:user:${userId}`);
  }

  async delPresence(userId: string) {
    await this.redis.del(`ws:user:${userId}`);
  }

  async clearAllPresences() {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'ws:user:*', 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await this.redis.del(...keys);
    } while (cursor !== '0');
  }

  setMaintenance(
    data: { maintenanceTime: string; maintenanceDuration: number } | null,
  ): void {
    this.maintenanceState = data;
  }

  broadcastToAll(data: Record<string, unknown>): void {
    const msg = JSON.stringify(data);
    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  sendToUser(userId: string, data: Record<string, unknown>): void {
    const client = this.clientMap.get(userId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.broadcastToAll({ event: 'system:shutdown' });
    for (const client of this.server.clients) {
      client.terminate();
    }
    
    this.clearAllPresences();
  }

  async handleConnection(client: AuthedSocket, request: IncomingMessage): Promise<void> {
    const qs = request.url?.split('?')[1] ?? '';
    const ticket = new URLSearchParams(qs).get('ticket');
    if (!ticket) {
      client.close(4401, 'Missing ticket');
      return;
    }

    const userId = await this.authService.validateWsTicket(ticket);
    if (!userId) {
      client.close(4401, 'Invalid or expired ticket');
      return;
    }

    client.userId = userId;
    this.clientMap.set(userId, client);
    await this.setPresence(userId, 'lobby');

    if (this.maintenanceState && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event: 'system:maintenance', ...this.maintenanceState }));
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const userId = client.userId;
    if (!userId) return;

    this.clientMap.delete(userId);

    const presence = await this.getPresence(userId);
    if (presence && presence !== 'lobby') {
      const matchId = presence;
      await this.matchesService.flushStateToDB(matchId);
      const opponentId = await this.matchesService.getMatchOpponent(matchId, userId);
      if (opponentId) {
        const opponentPresence = await this.getPresence(opponentId);
        if (opponentPresence === matchId)
          this.sendToUser(opponentId, { event: 'opponent_disconnected', matchId });
      }
    }
    await this.delPresence(userId);
  }

  @SubscribeMessage('open_match')
  async handleOpenMatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { matchId: string },
  ): Promise<void> {
    const userId = client.userId!;
    const { matchId } = data;

    // Validate user is a player in this match
    const playerIndex = await this.matchesService.getPlayerIndex(matchId, userId);
    if (!playerIndex) return;

    // If navigating from another match, close it first (flushes state + notifies old opponent)
    const curPresence = await this.getPresence(userId);
    if (curPresence && curPresence !== 'lobby') {
      await this.handleCloseMatch(client, { matchId: curPresence });
    }
    await this.setPresence(userId, matchId);

    // Drain replay buffer
    const replay = await this.matchesService.popReplay(matchId, userId);
    if (replay) {
      client.send(JSON.stringify({ event: 'match:replay', matchId, replay }));
    }

    // Send current state view; null means match is completed/abandoned (game key cleared from cache)
    const view = await this.matchesService.getPlayerView(matchId, playerIndex);
    if (view) {
      client.send(JSON.stringify({ event: 'match:state', matchId, view }));
    } else {
      const match = await this.matchesService.findMatch(matchId);
      if (match) client.send(JSON.stringify({ event: 'match:over', match }));
    }

    // Notify both players if opponent is also viewing this match
    const opponentId = await this.matchesService.getMatchOpponent(matchId, userId);
    if (opponentId) {
      const opponentPresence = await this.getPresence(opponentId);
      if (opponentPresence === matchId) {
        this.sendToUser(userId, { event: 'opponent_connected', matchId, playerId: opponentId });
        this.sendToUser(opponentId, { event: 'opponent_connected', matchId, playerId: userId });
      }
    }
  }

  @SubscribeMessage('close_match')
  async handleCloseMatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { matchId: string },
  ): Promise<void> {
    const userId = client.userId!;
    const { matchId } = data;

    await this.setPresence(userId, 'lobby');
    await this.matchesService.flushStateToDB(matchId);

    const opponentId = await this.matchesService.getMatchOpponent(matchId, userId)
    if (opponentId) {
      const opponentPresence = await this.getPresence(opponentId);
      if (opponentPresence === matchId)
        this.sendToUser(opponentId, { event: 'opponent_disconnected', matchId });
    }
  }

  @OnEvent('match:moves')
  async onMatchMoves(payload: {
    matchId: string;
    initialView1: GameView;
    initialView2: GameView;
    player1Id: string;
    player2Id: string;
    steps: Array<{ move: GameMove; playerIndex: number; player1View: GameView; player2View: GameView }>;
  }): Promise<void> {
    const { matchId, initialView1, initialView2, player1Id, player2Id, steps } = payload;

    const p1Presence = await this.getPresence(player1Id);
    const p2Presence = await this.getPresence(player2Id);
    const p1Viewing = p1Presence === matchId;
    const p2Viewing = p2Presence === matchId;

    const p1Buffer: { move: GameMove, view: GameView, playerIndex: number }[] = [];
    const p2Buffer: { move: GameMove, view: GameView, playerIndex: number }[] = [];

    for (const step of steps) {
      const base = { event: 'match:move', matchId, move: step.move, playerIndex: step.playerIndex };
      if (p1Viewing) {
        this.sendToUser(player1Id, { ...base, view: step.player1View });
      } else {
        p1Buffer.push({ move: step.move, view: step.player1View, playerIndex: step.playerIndex });
      }
      if (p2Viewing) {
        this.sendToUser(player2Id, { ...base, view: step.player2View });
      } else {
        p2Buffer.push({ move: step.move, view: step.player2View, playerIndex: step.playerIndex });
      }
    }

    this.matchesService.pushReplay(matchId, initialView1, player1Id, p1Buffer);
    this.matchesService.pushReplay(matchId, initialView2, player2Id, p2Buffer);
    // TODO: enqueue FCM notification (BullMQ short-delay job, cancel on open_match)
  }

  @OnEvent('match:start')
  onMatchStart(payload: { inviteCode: string, initialView1: GameView, initialView2: GameView, match: Record<string, unknown> }): void {
    if (payload.match.player1Id) this.sendToUser(payload.match.player1Id as string, { event: 'match:start', inviteCode: payload.inviteCode, initialView: payload.initialView1, match: payload.match });
    if (payload.match.player2Id) this.sendToUser(payload.match.player2Id as string, { event: 'match:start', inviteCode: payload.inviteCode, initialView: payload.initialView2, match: payload.match });
  }

  @OnEvent('match:over')
  onMatchOver(payload: { match: Record<string, unknown> }): void {
    if (payload.match.player1Id) this.sendToUser(payload.match.player1Id as string, { event: 'match:over', match: payload.match });
    if (payload.match.player2Id) this.sendToUser(payload.match.player2Id as string, { event: 'match:over', match: payload.match });
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: WebSocket) {
    client.send(JSON.stringify({ event: 'pong' }));
  }
}
