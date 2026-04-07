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
    // TODO: set user:{userId}:ws in Redis
  }

  handleDisconnect(_client: WebSocket) {
    // TODO: remove user:{userId}:ws from Redis
    // TODO: remove all match:{matchId}:viewing:{userId} keys for this user
    // TODO: send opponent_disconnected { matchId } to affected opponents
  }

  @SubscribeMessage('open_match')
  handleOpenMatch(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { matchId: string },
  ) {
    // TODO: set match:{matchId}:viewing:{userId} in Redis
    // TODO: if opponent also has match:{matchId}:viewing:{opponentId}
    //         → send opponent_connected { matchId, playerId } to opponent
    throw new Error('not implemented');
  }

  @SubscribeMessage('close_match')
  handleCloseMatch(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { matchId: string },
  ) {
    // TODO: remove match:{matchId}:viewing:{userId} from Redis
    // TODO: if opponent is connected → send opponent_disconnected { matchId, playerId } to opponent
    throw new Error('not implemented');
  }

  @SubscribeMessage('move')
  handleMove(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { matchId: string; move: unknown },
  ) {
    // TODO: validate userId is a player in matchId
    // TODO: call MatchesService.submitMove (validates via game plugin, writes Postgres)
    // TODO: check user:{opponentId}:ws in Redis
    //   YES → send match:state { matchId, view } to both players over WS
    //   NO  → send match:state { matchId, view } to mover; enqueue FCM to opponent
    throw new Error('not implemented');
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: WebSocket) {
    client.send(JSON.stringify({ event: 'pong' }));
  }
}
