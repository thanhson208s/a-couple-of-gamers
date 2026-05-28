import { IncomingMessage } from 'http';
import { Reflector } from '@nestjs/core';
import { WebSocket } from 'ws';
import { WsGateway } from './ws.gateway';
import { WsService } from './ws.service';
import { WsThrottler } from './ws.throttler';

class FakeSocket {
  userId?: string;
  readyState: number = WebSocket.OPEN;
  close = jest.fn((code?: number, reason?: string) => {
    this.closeCode = code;
    this.closeReason = reason;
    if (this.emitCloseOnClose) {
      this.readyState = WebSocket.CLOSED;
      this.closeListener?.();
    }
  });
  terminate = jest.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.closeListener?.();
  });
  on = jest.fn();
  once = jest.fn((event: string, listener: () => void) => {
    if (event === 'close') this.closeListener = listener;
    return this;
  });
  send = jest.fn();

  closeCode?: number;
  closeReason?: string;
  emitCloseOnClose = true;
  private closeListener?: () => void;
}

describe('WsGateway', () => {
  const USER_ID = 'user-1';

  let gateway: WsGateway;
  let wsService: jest.Mocked<Pick<WsService, 'validateWsTicket'>>;

  beforeEach(() => {
    wsService = {
      validateWsTicket: jest.fn().mockResolvedValue(USER_ID),
    };

    gateway = new WsGateway(
      wsService as unknown as WsService,
      { check: jest.fn() } as unknown as WsThrottler,
      { getProviders: jest.fn().mockReturnValue([]) } as any,
      { getAllMethodNames: jest.fn().mockReturnValue([]) } as any,
      new Reflector(),
    );
  });

  function request(ticket = 'ticket'): IncomingMessage {
    return { url: `/v1/ws?ticket=${ticket}` } as IncomingMessage;
  }

  function clients() {
    return (gateway as any).clientMap as Map<string, FakeSocket>;
  }

  it('closes an existing user socket before replacing it with the new socket', async () => {
    const oldSocket = new FakeSocket();
    const newSocket = new FakeSocket();
    clients().set(USER_ID, oldSocket);

    await gateway.handleConnection(newSocket as unknown as WebSocket, request());

    expect(oldSocket.close).toHaveBeenCalledWith(4000, 'Another device');
    expect(oldSocket.terminate).not.toHaveBeenCalled();
    expect(clients().get(USER_ID)).toBe(newSocket);
    expect(newSocket.userId).toBe(USER_ID);
    expect(newSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('terminates the old socket after the replacement close timeout', async () => {
    jest.useFakeTimers();
    const oldSocket = new FakeSocket();
    oldSocket.emitCloseOnClose = false;
    const newSocket = new FakeSocket();
    clients().set(USER_ID, oldSocket);

    const connection = gateway.handleConnection(newSocket as unknown as WebSocket, request());
    await Promise.resolve();

    expect(oldSocket.close).toHaveBeenCalledWith(4000, 'Another device');
    expect(clients().get(USER_ID)).toBe(oldSocket);

    jest.advanceTimersByTime(3_000);
    await connection;

    expect(oldSocket.terminate).toHaveBeenCalledTimes(1);
    expect(clients().get(USER_ID)).toBe(newSocket);
    jest.useRealTimers();
  });

  it('does not close another socket when the user has no existing connection', async () => {
    const newSocket = new FakeSocket();

    await gateway.handleConnection(newSocket as unknown as WebSocket, request());

    expect(clients().get(USER_ID)).toBe(newSocket);
    expect(newSocket.close).not.toHaveBeenCalled();
    expect(newSocket.terminate).not.toHaveBeenCalled();
  });
});
