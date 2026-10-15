import { io } from 'socket.io-client';
import type { Command, Reply, RoomState } from '../../../shared/src/types';
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 700,
  timeout: 10000,
});
export let identity = { id: '', token: '', code: '' };
try {
  identity = JSON.parse(sessionStorage.getItem('arena-session') ?? 'null') ?? identity;
} catch {}
export async function request(event: string, data: unknown = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, data, (err: Error | null, reply: Reply) => {
      if (err) reject(new Error('The arena did not respond. Check your connection.'));
      else if (!reply.ok) {
        const rejection = new Error(reply.error ?? 'Request rejected.');
        rejection.name = 'ServerRejection';
        reject(rejection);
      } else resolve(reply);
    });
  });
}
export function remember(reply: Reply) {
  if (reply.playerId && reply.token && reply.room) {
    identity = { id: reply.playerId, token: reply.token, code: reply.room.code };
    sessionStorage.setItem('arena-session', JSON.stringify(identity));
  }
}
export function forget() {
  identity = { id: '', token: '', code: '' };
  sessionStorage.removeItem('arena-session');
}
export const sendCommand = (command: Command) =>
  request('command', {
    id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
    command,
  });
export function connect(
  onState: (state: RoomState) => void,
  onError: (message: string) => void,
  onConnection: (connected: boolean) => void,
  onExpired: () => void,
) {
  socket.on('state', onState);
  socket.on('connect', async () => {
    onConnection(true);
    if (identity.token)
      try {
        const r = await request('resume', { code: identity.code, token: identity.token });
        remember(r);
        if (r.room) onState(r.room);
      } catch (e: any) {
        if (e.name === 'ServerRejection') {
          forget();
          onExpired();
        }
        onError(e.message);
      }
  });
  socket.on('disconnect', () => onConnection(false));
  socket.on('connect_error', () => onConnection(false));
  socket.on('replaced', () => {
    forget();
    onExpired();
    onError('This seat was opened in another tab.');
  });
}
