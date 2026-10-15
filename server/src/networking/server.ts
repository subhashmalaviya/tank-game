import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { Rooms, type Member, type Room } from '../rooms/manager';
import { Store } from '../persistence/store';
import { Limiter, nameSchema, codeSchema, tankSchema } from '../security/validation';
import { commandSchema } from '../../../shared/src/configs/match';
import type { TankId } from '../../../shared/src/types';
export async function createArena(
  options: {
    store?: Store;
    origins?: string[];
    tickMs?: number;
    clientDir?: string;
    creationLimit?: number;
  } = {},
) {
  const store =
    options.store ??
    new Store(process.env.DATA_FILE ?? 'data/arena.json', process.env.DATABASE_URL);
  await store.init();
  const app = express(),
    http = createServer(app);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(express.json({ limit: '8kb' }));
  const configuredOrigins = (
    process.env.ALLOWED_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (process.env.RENDER_EXTERNAL_URL) {
    configuredOrigins.push(process.env.RENDER_EXTERNAL_URL.trim());
  }

  const origins = options.origins ?? configuredOrigins;

  const isOriginAllowed = (origin?: string, host?: string) => {
    if (!origin) return true;
    if (origins.includes('*') || origins.includes(origin)) return true;
    if (host && (origin === `http://${host}` || origin === `https://${host}`)) return true;
    return false;
  };

  const io = new Server(http, {
    maxHttpBufferSize: 8192,
    pingTimeout: 15000,
    pingInterval: 10000,
    cors: {
      origin: (requestOrigin, callback) => {
        if (!requestOrigin || isOriginAllowed(requestOrigin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: ['GET', 'POST'],
    },
    allowRequest: (req, done) => done(null, isOriginAllowed(req.headers.origin, req.headers.host)),
  });
  const rooms = new Rooms(store),
    limiter = new Limiter(55, 10000),
    authLimiter = new Limiter(12, 60000),
    creationLimiter = new Limiter(options.creationLimit ?? 15, 60000);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, req.headers.host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, rooms: rooms.rooms.size, protocol: 2, build: 'simultaneous-overlays-v2' }),
  );
  const credentials = z.object({ name: nameSchema, password: z.string().min(8).max(128) }).strict();
  for (const action of ['register', 'login'] as const)
    app.post('/api/auth/' + action, async (req, res) => {
      try {
        if (!authLimiter.allow(req.ip ?? 'unknown'))
          throw new Error('Too many attempts. Wait a minute.');
        const data = credentials.parse(req.body);
        res.json(await store[action](data.name, data.password));
      } catch (e: any) {
        res.status(400).json({ error: message(e) });
      }
    });
  app.get('/api/profile', (req, res) => {
    try {
      res.json(store.profile(req.headers.authorization?.replace(/^Bearer /, '') ?? ''));
    } catch (e: any) {
      res.status(401).json({ error: message(e) });
    }
  });
  const clientDir = options.clientDir ?? path.resolve('dist/client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  function broadcast(room: Room) {
    for (const m of room.members) {
      if (m.socketId) io.to(m.socketId).emit('state', rooms.snapshot(room, m.id));
    }
    if (room.game?.state.result)
      void rooms
        .record(room)
        .catch((err) => console.error('Match persistence failed:', err.message));
  }
  function membership(socket: Socket): { room: Room; member: Member } {
    const room = rooms.get(socket.data.code);
    const member = room.members.find(
      (m) => m.id === socket.data.playerId && m.socketId === socket.id,
    );
    if (!member) throw new Error('Join a room first.');
    return { room, member };
  }
  function leavePrevious(socket: Socket) {
    if (socket.data.code) {
      try {
        const { room, member } = membership(socket);
        rooms.leave(room, member);
        socket.leave(room.code);
        broadcast(room);
      } catch {}
      socket.data.code = undefined;
      socket.data.playerId = undefined;
    }
  }
  function attach(socket: Socket, room: Room, member: Member) {
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.playerId = member.id;
    return {
      ok: true,
      room: rooms.snapshot(room, member.id),
      playerId: member.id,
      token: member.token,
    };
  }
  io.on('connection', (socket) => {
    socket.onAny(() => {
      if (!limiter.allow(socket.id)) socket.disconnect(true);
    });
    function handle(event: string, fn: (data: any) => unknown) {
      socket.on(event, (input: unknown, ack: unknown) => {
        try {
          if (typeof ack !== 'function') return;
          const result = fn(input);
          ack(result ?? { ok: true });
        } catch (e: any) {
          if (typeof ack === 'function') ack({ ok: false, error: message(e) });
        }
      });
    }
    const entry = z
      .object({
        name: nameSchema,
        password: z.string().max(64).optional(),
        accountToken: z.string().max(128).optional(),
      })
      .strict();
    handle('create', (data) => {
      const p = entry.parse(data);
      if (
        !creationLimiter.allow(
          process.env.TRUST_PROXY === '1'
            ? String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address)
                .split(',')
                .at(-1)!
                .trim()
            : socket.handshake.address,
        )
      )
        throw new Error('Too many rooms. Try again in a minute.');
      leavePrevious(socket);
      const account = store.account(p.accountToken);
      const { room, member } = rooms.create(
        account?.name ?? p.name,
        socket.id,
        account?.id,
        p.password,
      );
      return attach(socket, room, member);
    });
    handle('join', (data) => {
      const p = entry.extend({ code: codeSchema }).parse(data);
      if (
        !creationLimiter.allow(
          process.env.TRUST_PROXY === '1'
            ? String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address)
                .split(',')
                .at(-1)!
                .trim()
            : socket.handshake.address,
        )
      )
        throw new Error('Too many attempts. Try again in a minute.');
      const account = store.account(p.accountToken);
      const room = rooms.get(p.code);
      if (socket.data.code === room.code) throw new Error('You are already in this room.');
      const joined = rooms.join(
        p.code,
        account?.name ?? p.name,
        socket.id,
        account?.id,
        p.password,
      );
      leavePrevious(socket);
      const result = attach(socket, joined.room, joined.member);
      broadcast(joined.room);
      return result;
    });
    handle('resume', (data) => {
      const p = z
        .object({ code: codeSchema, token: z.string().length(64) })
        .strict()
        .parse(data);
      const { room, member, previous } = rooms.reconnect(p.code, p.token, socket.id);
      if (previous && previous !== socket.id) {
        const old = io.sockets.sockets.get(previous);
        if (old) {
          old.data.code = undefined;
          old.emit('replaced');
          old.disconnect(true);
        }
      }
      if (socket.data.code && socket.data.code !== room.code) leavePrevious(socket);
      const result = attach(socket, room, member);
      broadcast(room);
      return result;
    });
    handle('configure', (data) => {
      const { room, member } = membership(socket);
      rooms.configure(room, member, data);
      broadcast(room);
    });
    handle('select', (data) => {
      const p = z
        .object({ tank: tankSchema, team: z.number().int().min(0).max(7) })
        .strict()
        .parse(data);
      const { room, member } = membership(socket);
      rooms.select(room, member, p.tank as TankId, p.team);
      broadcast(room);
    });
    handle('ready', (data) => {
      const ready = z.boolean().parse(data),
        { room, member } = membership(socket);
      if (room.game) throw new Error('Match has started.');
      member.ready = ready;
      rooms.changed(room);
      broadcast(room);
    });
    handle('start', () => {
      const { room, member } = membership(socket);
      rooms.start(room, member);
      broadcast(room);
    });
    handle('lobby', () => {
      const { room, member } = membership(socket);
      rooms.lobby(room, member);
      broadcast(room);
    });
    handle('rematch', () => {
      const { room, member } = membership(socket);
      rooms.host(room, member);
      if (!room.game?.state.result) throw new Error('Finish the current match first.');
      rooms.lobby(room, member);
      room.members.forEach((m) => (m.ready = true));
      rooms.start(room, member);
      broadcast(room);
    });
    handle('leave', () => {
      leavePrevious(socket);
    });
    handle('command', (data) => {
      const envelope = z
          .object({ id: z.string().min(8).max(64), command: commandSchema })
          .strict()
          .parse(data),
        { room, member } = membership(socket);
      if (member.commands.has(envelope.id)) throw new Error('Command already processed.');
      if (!room.game) throw new Error('Start a match first.');
      member.commands.add(envelope.id);
      if (member.commands.size > 256)
        member.commands.delete(member.commands.values().next().value!);
      room.game.action(member.id, envelope.command);
      rooms.changed(room);
      broadcast(room);
    });
    handle('quick', (data) => {
      const p = entry.parse(data);
      if (
        !creationLimiter.allow(
          process.env.TRUST_PROXY === '1'
            ? String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address)
                .split(',')
                .at(-1)!
                .trim()
            : socket.handshake.address,
        )
      )
        throw new Error('Too many requests.');
      leavePrevious(socket);
      const a = store.account(p.accountToken);
      let room = [...rooms.rooms.values()].find(
        (r) =>
          r.config.visibility === 'public' &&
          r.quickAt &&
          !r.game &&
          !r.passwordHash &&
          r.members.length < r.config.maxPlayers,
      );
      let member: Member;
      if (room) {
        ({ member } = rooms.join(room.code, a?.name ?? p.name, socket.id, a?.id));
      } else {
        ({ room, member } = rooms.create(a?.name ?? p.name, socket.id, a?.id));
        room.config = { ...room.config, maxPlayers: 2, bots: 1, visibility: 'public' };
        room.quickAt = Date.now() + 10000;
      }
      member.ready = true;
      if (room.members.length === 2) {
        room.config.bots = 0;
        rooms.start(
          room,
          room.members.find((m) => m.id === room!.hostId)!,
        );
      }
      const result = attach(socket, room, member);
      broadcast(room);
      return result;
    });
    handle('publicRooms', () => ({
      ok: true,
      rooms: [...rooms.rooms.values()]
        .filter((r) => r.config.visibility === 'public' && !r.game && !r.passwordHash)
        .map((r) => ({ code: r.code, players: r.members.length, max: r.config.maxPlayers })),
    }));
    socket.on('disconnect', () => {
      try {
        const { room, member } = membership(socket);
        rooms.disconnect(room, member);
        broadcast(room);
      } catch {}
    });
  });
  let ticks = 0;
  const timer = setInterval(() => {
    for (const room of rooms.rooms.values()) {
      try {
        if (room.quickAt && Date.now() >= room.quickAt && !room.game) {
          room.quickAt = undefined;
          if (room.members.some((m) => m.connected)) {
            room.config.bots = room.config.maxPlayers - room.members.length;
            rooms.start(
              room,
              room.members.find((m) => m.id === room.hostId)!,
            );
            broadcast(room);
          }
        }
        if (room.game?.tick()) broadcast(room);
      } catch (e: any) {
        console.error('Room tick:', e.message);
      }
    }
    if (++ticks % 50 === 0) {
      for (const changed of rooms.sweep()) broadcast(changed);
      limiter.clean();
      authLimiter.clean();
      creationLimiter.clean();
    }
  }, options.tickMs ?? 100);
  timer.unref();
  return {
    app,
    http,
    io,
    rooms,
    store,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
      await store.close();
    },
  };
}
function message(e: any) {
  return e instanceof z.ZodError
    ? e.issues.map((i) => i.message).join(' ')
    : (e.message ?? 'Request rejected.');
}
