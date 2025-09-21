import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomManager } from './rooms';

declare module 'ws' {
  interface WebSocket {
    OPEN: number;
  }
}

class MockWebSocket extends EventEmitter {
  static readonly OPEN = 1;

  public OPEN = MockWebSocket.OPEN;
  public readyState = MockWebSocket.OPEN;
  public sent: string[] = [];
  public send = vi.fn((data: string) => {
    this.sent.push(String(data));
  });

  public close = vi.fn(() => {
    this.readyState = 3;
    this.emit('close');
  });

  emitClose() {
    this.readyState = 3;
    this.emit('close');
  }
}

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('adds clients on join, broadcasts presence and sends state snapshot', () => {
    const firstSocket = new MockWebSocket();
    manager.join('room-1', firstSocket as unknown as WebSocket, 'Alice');

    expect(firstSocket.send).toHaveBeenCalledTimes(2);
    const initialMessages = firstSocket.sent.map((payload) => JSON.parse(payload));
    expect(initialMessages[0]).toEqual({ type: 'presence', users: ['Alice'] });
    expect(initialMessages[1]).toEqual({
      type: 'state',
      action: 'pause',
      time: 0,
      updatedAt: Date.now()
    });

    const secondSocket = new MockWebSocket();
    manager.join('room-1', secondSocket as unknown as WebSocket, 'Bob');

    const secondMessages = secondSocket.sent.map((payload) => JSON.parse(payload));
    expect(secondMessages[0]).toEqual({ type: 'presence', users: ['Alice', 'Bob'] });
    expect(secondMessages[1]).toEqual({
      type: 'state',
      action: 'pause',
      time: 0,
      updatedAt: Date.now()
    });

    const presenceUpdate = JSON.parse(firstSocket.sent[2]);
    expect(presenceUpdate).toEqual({ type: 'presence', users: ['Alice', 'Bob'] });
  });

  it('removes clients on close and deletes empty rooms', () => {
    const aliceSocket = new MockWebSocket();
    const bobSocket = new MockWebSocket();

    manager.join('shared', aliceSocket as unknown as WebSocket, 'Alice');
    manager.join('shared', bobSocket as unknown as WebSocket, 'Bob');

    bobSocket.emitClose();

    const aliceMessages = aliceSocket.sent.map((payload) => JSON.parse(payload));
    expect(aliceMessages[aliceMessages.length - 1]).toEqual({
      type: 'presence',
      users: ['Alice']
    });

    const carolSocket = new MockWebSocket();
    const newTimestamp = new Date('2024-01-01T00:10:00Z');
    vi.setSystemTime(newTimestamp);
    carolSocket.sent.length = 0;

    aliceSocket.emitClose();

    manager.join('shared', carolSocket as unknown as WebSocket, 'Carol');

    const messages = carolSocket.sent.map((payload) => JSON.parse(payload));
    expect(messages[0]).toEqual({ type: 'presence', users: ['Carol'] });
    expect(messages[1]).toEqual({
      type: 'state',
      action: 'pause',
      time: 0,
      updatedAt: newTimestamp.getTime()
    });
  });

  it('broadcasts control updates to active clients', () => {
    const aliceSocket = new MockWebSocket();
    const bobSocket = new MockWebSocket();

    manager.join('room', aliceSocket as unknown as WebSocket, 'Alice');
    manager.join('room', bobSocket as unknown as WebSocket, 'Bob');

    const controlTimestamp = new Date('2024-01-01T01:00:00Z');
    vi.setSystemTime(controlTimestamp);
    manager.handleControl('room', 'play', 42);

    const aliceState = JSON.parse(aliceSocket.sent.at(-1) as string);
    const bobState = JSON.parse(bobSocket.sent.at(-1) as string);

    expect(aliceState).toEqual({
      type: 'state',
      action: 'play',
      time: 42,
      updatedAt: controlTimestamp.getTime()
    });
    expect(bobState).toEqual(aliceState);

    bobSocket.emitClose();
    const pauseTimestamp = new Date('2024-01-01T01:05:00Z');
    vi.setSystemTime(pauseTimestamp);
    manager.handleControl('room', 'pause', 50);

    const aliceFinalState = JSON.parse(aliceSocket.sent.at(-1) as string);
    expect(aliceFinalState).toEqual({
      type: 'state',
      action: 'pause',
      time: 50,
      updatedAt: pauseTimestamp.getTime()
    });
    expect(bobSocket.send).toHaveBeenCalledTimes(3);
  });
});
