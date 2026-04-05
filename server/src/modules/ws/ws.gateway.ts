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

// Connection URL: wss://<host>/v1/matches/:matchId/ws?ticket=<ws-ticket>
// Authentication: one-time WS ticket from POST /v1/auth/ws-ticket
// See: docs/security.md#websocket-authentication
@WebSocketGateway({ path: '/v1/matches/ws', server: 'ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(_client: WebSocket) {
    // TODO: validate ws-ticket from query param, extract matchId, register presence
  }

  handleDisconnect(_client: WebSocket) {
    // TODO: remove from Redis presence, broadcast opponent_disconnected
  }

  @SubscribeMessage('move')
  handleMove(
    @ConnectedSocket() _client: WebSocket,
    @MessageBody() _data: { move: unknown },
  ) {
    // TODO: validate auth, call MatchesService.submitMove, broadcast state
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: WebSocket) {
    client.send(JSON.stringify({ event: 'pong' }));
  }
}
