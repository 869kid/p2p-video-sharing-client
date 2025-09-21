import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectSync } from './sync';

class MockBrowserWebSocket extends EventTarget {
  static readonly OPEN = 1;

  public readyState = 0;
  public readonly sent: string[] = [];
  public readonly close = vi.fn(() => {
    this.readyState = 3;
  });
  public readonly send = vi.fn((payload: string) => {
    this.sent.push(String(payload));
  });

  constructor(public readonly url: string) {
    super();
  }

  open() {
    this.readyState = MockBrowserWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  dispatchMessage(data: unknown) {
    const event = new MessageEvent('message', { data });
    this.dispatchEvent(event);
  }
}

describe('connectSync', () => {
  let sockets: MockBrowserWebSocket[];
  let webSocketFactory: ReturnType<typeof vi.fn> & { OPEN: number };

  beforeEach(() => {
    sockets = [];
    webSocketFactory = Object.assign(
      vi.fn((url: string) => {
        const socket = new MockBrowserWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      }),
      { OPEN: MockBrowserWebSocket.OPEN }
    );
    vi.stubGlobal('WebSocket', webSocketFactory as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens a websocket connection and sends join payload on open event', () => {
    const connection = connectSync('https://api.example.com/app', {
      roomId: 'room-1',
      userName: 'Alice'
    });

    expect(webSocketFactory).toHaveBeenCalledWith('wss://api.example.com/ws');
    const socket = sockets[0];
    expect(socket.sent).toEqual([]);

    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'join',
      roomId: 'room-1',
      userName: 'Alice'
    });

    connection.close();
  });

  it('sends control messages only after the socket is ready', () => {
    const connection = connectSync('http://localhost:1234/base', {
      roomId: 'room-2',
      userName: 'Bob'
    });

    const socket = sockets[0];

    connection.sendControl({ action: 'play', time: 12 });
    expect(socket.sent).toEqual([]);

    socket.open();
    expect(socket.sent).toHaveLength(1);

    connection.sendControl({ action: 'pause', time: 20 });
    expect(JSON.parse(socket.sent[1])).toEqual({
      type: 'control',
      action: 'pause',
      time: 20
    });

    connection.close();
    expect(socket.close).toHaveBeenCalled();
    expect(webSocketFactory.mock.calls[0][0]).toBe('ws://localhost:1234/ws');
  });

  it('invokes state and presence callbacks when receiving messages', () => {
    const connection = connectSync('https://sync.example.test', {
      roomId: 'sync-room',
      userName: 'Carol'
    });

    const socket = sockets[0];
    const onState = vi.fn();
    const onPresence = vi.fn();
    connection.onState(onState);
    connection.onPresence(onPresence);

    socket.dispatchMessage(
      JSON.stringify({ type: 'state', action: 'seek', time: 55, updatedAt: 123456 })
    );
    expect(onState).toHaveBeenCalledWith({ type: 'state', action: 'seek', time: 55, updatedAt: 123456 });

    socket.dispatchMessage(JSON.stringify({ type: 'presence', users: ['Carol', 'Dave'] }));
    expect(onPresence).toHaveBeenCalledWith(['Carol', 'Dave']);

    socket.dispatchMessage('not json');
    connection.close();
  });
});
