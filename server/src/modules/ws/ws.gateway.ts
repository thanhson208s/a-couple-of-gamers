import { IncomingMessage } from 'http';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';

import { ArgumentMetadata, OnApplicationShutdown, OnModuleInit, ValidationPipe } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Server, WebSocket, RawData } from 'ws';
import {
  WS_CONNECTED_METADATA,
  WS_DISCONNECTED_METADATA,
  WS_MESSAGE_METADATA,
  WS_DTO_METADATA,
} from './ws.decorators';
import { WsService } from './ws.service';

interface AuthedSocket extends WebSocket {
  userId?: string;
}

type MessageHandler = (payload: { userId: string } & Record<string, unknown>) => unknown | Promise<unknown>;
type LifecycleHandler = (payload: { userId: string }) => unknown | Promise<unknown>;

// Connection URL: wss://<host>/v1/ws?ticket=<ws-ticket>
// User-scoped persistent connection — opened once after login.
// Authentication: one-time WS ticket from POST /v1/auth/ws-ticket
// See: docs/security.md#websocket-authentication
// See: docs/features/match-session.md
//
// Inbound dispatch: handlers register via @OnWsMessage(event), @OnWsConnected,
// @OnWsDisconnected on any provider class. The gateway scans all providers at
// module init and routes incoming messages / lifecycle transitions directly to
// them — no EventEmitter bridge.
@WebSocketGateway({ path: '/v1/ws', server: 'ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown, OnModuleInit
{
  @WebSocketServer()
  server!: Server;

  // userId → socket for O(1) targeted sends
  private readonly clientMap = new Map<string, AuthedSocket>();

  private readonly messageHandlers = new Map<string, MessageHandler[]>();
  private readonly connectedHandlers: LifecycleHandler[] = [];
  private readonly disconnectedHandlers: LifecycleHandler[] = [];
  
  private readonly validationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true
  });
  private readonly messageDtos = new Map<string, new (...args: any[]) => any>();

  constructor(
    private readonly wsService: WsService,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discoveryService.getProviders()) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      for (const methodName of this.metadataScanner.getAllMethodNames(prototype)) {
        const method = (instance as Record<string, unknown>)[methodName];
        if (typeof method !== 'function') continue;

        const messageEvent = this.reflector.get<string>(WS_MESSAGE_METADATA, method);
        if (messageEvent) {
          if (!this.messageHandlers.has(messageEvent)) this.messageHandlers.set(messageEvent, []);
          this.messageHandlers.get(messageEvent)!.push(method.bind(instance) as MessageHandler);

          const dto = this.reflector.get(WS_DTO_METADATA, method);
          if (dto) this.messageDtos.set(messageEvent, dto);
        }

        if (this.reflector.get<boolean>(WS_CONNECTED_METADATA, method)) {
          this.connectedHandlers.push(method.bind(instance) as LifecycleHandler);
        }
        if (this.reflector.get<boolean>(WS_DISCONNECTED_METADATA, method)) {
          this.disconnectedHandlers.push(method.bind(instance) as LifecycleHandler);
        }
      }
    }
  }

  broadcastToAll(data: Record<string, unknown>): void {
    const msg = JSON.stringify(data);
    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  broadcastToUser(userId: string, data: Record<string, unknown>): void {
    const client = this.clientMap.get(userId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  sendToUser(userId: string, event: string, data: Record<string, unknown>): void {
    const client = this.clientMap.get(userId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }

  errorToUser(userId: string, event: string, error: number): void {
    const client = this.clientMap.get(userId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ error, event }));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.broadcastToAll({ event: 'system:shutdown' });
    for (const client of this.server.clients) {
      client.terminate();
    }
  }

  async handleConnection(client: AuthedSocket, request: IncomingMessage): Promise<void> {
    const qs = request.url?.split('?')[1] ?? '';
    const ticket = new URLSearchParams(qs).get('ticket');
    if (!ticket) {
      client.close(4401, 'Missing ticket');
      return;
    }

    const userId = await this.wsService.validateWsTicket(ticket);
    if (!userId) {
      client.close(4401, 'Invalid or expired ticket');
      return;
    }

    client.userId = userId;
    this.clientMap.set(userId, client);
    client.on('message', (raw) => this.dispatchMessage(userId, raw));

    await Promise.all(this.connectedHandlers.map((h) => h({ userId })));
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const userId = client.userId;
    if (!userId) return;

    this.clientMap.delete(userId);

    await Promise.all(this.disconnectedHandlers.map((h) => h({ userId })));
  }

  private async dispatchMessage(userId: string, raw: RawData): Promise<void> {
    let parsed: { event?: unknown; data?: unknown };
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (typeof parsed.event !== 'string') return;

    if (parsed.event === 'ping') {
      this.broadcastToUser(userId, { event: 'pong' });
      return;
    }

    const handlers = this.messageHandlers.get(parsed.event);
    if (!handlers?.length) return;

    let data = (parsed.data && typeof parsed.data === 'object') ? parsed.data as Record<string, unknown> : {};
    
    // Data validation
    const DtoClass = this.messageDtos.get(parsed.event);
    if (DtoClass) {
      try {
        const metadata: ArgumentMetadata = { type: 'body', metatype: DtoClass, data: '' };
        data = await this.validationPipe.transform(data, metadata);
      } catch (e) {
        this.errorToUser(userId, parsed.event, 400);
        return;
      }
    }
    
    const payload = { userId, ...data };
    await Promise.all(handlers.map((h) => h(payload)));
  }
}
