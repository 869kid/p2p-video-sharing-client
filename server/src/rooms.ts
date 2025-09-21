import type { WebSocket } from 'ws';

export type ControlAction = 'play' | 'pause' | 'seek';

export interface ControlMessage {
  type: 'control';
  action: ControlAction;
  time: number;
}

export interface JoinMessage {
  type: 'join';
  roomId: string;
  userName: string;
}

export type RoomInboundMessage = JoinMessage | ControlMessage;

export interface PresenceMessage {
  type: 'presence';
  users: string[];
}

export interface StateMessage {
  type: 'state';
  action: ControlAction;
  time: number;
  updatedAt: number;
}

export type RoomOutboundMessage = PresenceMessage | StateMessage;

export interface RoomState {
  action: ControlAction;
  time: number;
  updatedAt: number;
}

interface RoomClient {
  socket: WebSocket;
  userName: string;
}

interface Room {
  id: string;
  clients: Set<RoomClient>;
  state: RoomState;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  join(roomId: string, socket: WebSocket, userName: string) {
    const room = this.getOrCreateRoom(roomId);
    const client: RoomClient = { socket, userName };
    room.clients.add(client);
    this.broadcastPresence(room);
    this.sendState(room, socket);
    socket.on('close', () => {
      room.clients.delete(client);
      if (room.clients.size === 0) {
        this.rooms.delete(roomId);
      } else {
        this.broadcastPresence(room);
      }
    });
  }

  handleControl(roomId: string, action: ControlAction, time: number) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    room.state = {
      action,
      time,
      updatedAt: Date.now()
    };
    this.broadcast(room, {
      type: 'state',
      action,
      time,
      updatedAt: room.state.updatedAt
    });
  }

  private getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        clients: new Set(),
        state: {
          action: 'pause',
          time: 0,
          updatedAt: Date.now()
        }
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private broadcast(room: Room, message: RoomOutboundMessage) {
    const data = JSON.stringify(message);
    for (const client of room.clients) {
      if (client.socket.readyState === client.socket.OPEN) {
        client.socket.send(data);
      }
    }
  }

  private broadcastPresence(room: Room) {
    this.broadcast(room, {
      type: 'presence',
      users: Array.from(room.clients).map((client) => client.userName)
    });
  }

  private sendState(room: Room, socket: WebSocket) {
    const { action, time, updatedAt } = room.state;
    const message: StateMessage = { type: 'state', action, time, updatedAt };
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}

export const rooms = new RoomManager();
