import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

// Connection URL: wss://<host>/v1/ws?ticket=<ws-ticket>
// User-scoped persistent connection — opened once after login.
// Authentication: one-time WS ticket from POST /v1/auth/ws-ticket
// See: docs/security.md#websocket-authentication
// See: docs/features/match-session.md
@WebSocketGateway({ path: '/v1/ws', server: 'ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(_client: WebSocket) {
    // TODO: validate ws-ticket from query param
    // TODO: extract userId from ticket, attach to client
    // TODO: set ws:{userId} = "lobby" in Redis
  }

  handleDisconnect(_client: WebSocket) {
    // TODO: read ws:{userId} — if value is a matchId, send opponent_disconnected to that match's opponent
    // TODO: delete ws:{userId} from Redis
  }

  @SubscribeMessage('open_match')
  handleOpenMatch(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { matchId: string },
  ) {
    // TODO: read current ws:{userId}
    //   if current value is a matchId (navigated from another match):
    //     → send opponent_disconnected { matchId: oldMatchId } to old match's opponent
    // TODO: set ws:{userId} = matchId in Redis
    // TODO: check ws:{opponentId} === matchId
    //   YES → send opponent_connected { matchId, playerId: opponentId } to self
    //         send opponent_connected { matchId, playerId: userId } to opponent
    throw new Error('not implemented');
  }

  @SubscribeMessage('close_match')
  handleCloseMatch(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { matchId: string },
  ) {
    // TODO: set ws:{userId} = "lobby" in Redis
    // TODO: if opponent ws:{opponentId} is present → send opponent_disconnected { matchId } to opponent
    throw new Error('not implemented');
  }

  @SubscribeMessage('move')
  handleMove(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { matchId: string; move: unknown },
  ) {
    // TODO: validate userId is a player in matchId
    // TODO: call MatchesService.submitMove (validates via game plugin, writes Postgres)
    // TODO: check ws:{opponentId} present (any value) in Redis
    //   YES → send match:state { matchId, view } to both players over WS
    //   NO  → send match:state { matchId, view } to mover; enqueue FCM to opponent
    throw new Error('not implemented');
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: WebSocket) {
    client.send(JSON.stringify({ event: 'pong' }));
  }
}
