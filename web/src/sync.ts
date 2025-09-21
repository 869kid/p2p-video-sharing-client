export type ControlAction = 'play' | 'pause' | 'seek';

export interface JoinPayload {
  roomId: string;
  userName: string;
}

export interface ControlPayload {
  action: ControlAction;
  time: number;
}

export interface SyncConnection {
  sendControl(payload: ControlPayload): void;
  close(): void;
  onState(callback: (state: { action: ControlAction; time: number; updatedAt: number }) => void): void;
  onPresence(callback: (users: string[]) => void): void;
}

export function connectSync(baseUrl: string, join: JoinPayload): SyncConnection {
  const wsUrl = buildWsUrl(baseUrl);
  const socket = new WebSocket(wsUrl);

  const stateCallbacks = new Set<(state: { action: ControlAction; time: number; updatedAt: number }) => void>();
  const presenceCallbacks = new Set<(users: string[]) => void>();

  socket.addEventListener('open', () => {
    const message = { type: 'join', ...join };
    socket.send(JSON.stringify(message));
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data as string);
      if (data.type === 'state') {
        stateCallbacks.forEach((callback) => callback(data));
      } else if (data.type === 'presence') {
        presenceCallbacks.forEach((callback) => callback(data.users));
      }
    } catch (error) {
      console.warn('Failed to parse sync payload', error);
    }
  });

  return {
    sendControl(payload) {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(
        JSON.stringify({
          type: 'control',
          ...payload
        })
      );
    },
    close() {
      socket.close();
    },
    onState(callback) {
      stateCallbacks.add(callback);
    },
    onPresence(callback) {
      presenceCallbacks.add(callback);
    }
  };
}

function buildWsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol.replace('http', 'ws');
  url.pathname = '/ws';
  return url.toString();
}
