import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { Game } from '../game/engine';
import { DEFAULT_CONFIG, configSchema } from '../../../shared/src/configs/match';
import { TANK_IDS } from '../../../shared/src/configs/tanks';
import type { LobbyPlayer, MatchConfig, RoomState, TankId } from '../../../shared/src/types';
import type { Store } from '../persistence/store';
export interface Member extends LobbyPlayer {
  token: string;
  socketId: string | null;
  accountId?: string;
  commands: Set<string>;
  disconnectedAt: number;
}
export interface Room {
  code: string;
  hostId: string;
  config: MatchConfig;
  members: Member[];
  game: Game | null;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  recorded: boolean;
  recording?: boolean;
  matchAccounts?: Record<string, string>;
  quickAt?: number;
}
export class Rooms {
  rooms = new Map<string, Room>();
  constructor(private store: Store) {}
  create(name: string, socketId: string, accountId?: string, password = '') {
    if (this.rooms.size >= 300) throw new Error('Arena is full. Try again shortly.');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = Array.from(randomBytes(6), (x) => chars[x % chars.length]).join('');
    } while (this.rooms.has(code));
    const member = this.member(name, socketId, 0, accountId),
      room: Room = {
        code,
        hostId: member.id,
        config: { ...DEFAULT_CONFIG },
        members: [member],
        game: null,
        passwordHash: password ? this.hash(password) : '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        recorded: false,
      };
    this.rooms.set(code, room);
    return { room, member };
  }
  join(code: string, name: string, socketId: string, accountId?: string, password = '') {
    const room = this.get(code);
    if (room.game) throw new Error('Match already started. Reconnect with your original browser.');
    if (room.members.length >= room.config.maxPlayers) throw new Error('Room is full.');
    if (
      room.passwordHash &&
      !timingSafeEqual(Buffer.from(room.passwordHash), Buffer.from(this.hash(password)))
    )
      throw new Error('Incorrect room password.');
    if (accountId && room.members.some((p) => p.accountId === accountId))
      throw new Error('This account is already in the room.');
    const member = this.member(name, socketId, this.availableTeam(room), accountId);
    room.members.push(member);
    this.changed(room);
    return { room, member };
  }
  private hash(v: string) {
    return createHash('sha256').update(v).digest('hex');
  }
  private member(
    name: string,
    socketId: string | null,
    team: number,
    accountId?: string,
    bot = false,
  ): Member {
    return {
      id: randomUUID(),
      name,
      tank: TANK_IDS[Math.floor(Math.random() * TANK_IDS.length)],
      team,
      ready: bot,
      connected: true,
      bot,
      token: randomBytes(32).toString('hex'),
      socketId,
      accountId,
      commands: new Set(),
      disconnectedAt: 0,
    };
  }
  get(code: string) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found. Check the code.');
    return room;
  }
  availableTeam(room: Room) {
    for (let t = 0; t < room.config.teams; t++)
      if (room.members.filter((m) => m.team === t).length < room.config.teamSize) return t;
    return 0;
  }
  configure(room: Room, actor: Member, input: unknown) {
    this.host(room, actor);
    if (room.game) throw new Error('Return to the lobby before changing rules.');
    const config = configSchema.parse(input);
    if (config.maxPlayers < room.members.filter((m) => !m.bot).length)
      throw new Error('Player limit is smaller than the current crew.');
    room.members = room.members.filter((m) => !m.bot);
    room.config = config;
    room.members.forEach((p, i) => {
      p.team = config.mode === 'teams' ? Math.floor(i / config.teamSize) : i;
      p.ready = false;
    });
    this.changed(room);
  }
  select(room: Room, member: Member, tank: TankId, team: number) {
    if (room.game) throw new Error('Tank selection is locked.');
    if (
      room.config.tankRule === 'unique' &&
      room.members.some((p) => p.id !== member.id && p.tank === tank)
    )
      throw new Error('That tank is already selected.');
    if (
      room.config.mode === 'teams' &&
      (team >= room.config.teams ||
        room.members.filter((p) => p.id !== member.id && p.team === team).length >=
          room.config.teamSize)
    )
      throw new Error('That team is full.');
    member.tank = tank;
    member.team = team;
    member.ready = false;
    this.changed(room);
  }
  start(room: Room, actor: Member) {
    this.host(room, actor);
    if (room.game) throw new Error('A match already exists.');
    configSchema.parse(room.config);
    const humans = room.members.filter((p) => !p.bot);
    if (humans.some((p) => !p.ready || !p.connected))
      throw new Error('Every player must be connected and ready.');
    room.members = humans;
    for (let i = 0; i < room.config.bots && room.members.length < room.config.maxPlayers; i++) {
      const bot = this.member(
        ['RUSTY', 'BOLT', 'DUSTY', 'ECHO', 'SPARK', 'RIVET', 'NIMBUS'][i],
        null,
        this.availableTeam(room),
        undefined,
        true,
      );
      if (room.config.tankRule === 'unique')
        bot.tank = TANK_IDS.find((t) => !room.members.some((p) => p.tank === t))!;
      room.members.push(bot);
    }
    if (room.members.length < 2) throw new Error('Add a friend or at least one bot.');
    if (room.config.mode === 'teams') {
      if (
        room.members.length !== room.config.maxPlayers ||
        Array.from(
          { length: room.config.teams },
          (_, t) => room.members.filter((p) => p.team === t).length,
        ).some((n) => n !== room.config.teamSize)
      )
        throw new Error('Team mode needs complete, balanced teams.');
    }
    if (
      room.config.tankRule === 'unique' &&
      new Set(room.members.map((m) => m.tank)).size !== room.members.length
    )
      throw new Error('Choose different tanks for unique selection.');
    room.game = new Game(room.members, room.config, randomBytes(4).readUInt32LE());
    room.recorded = false;
    room.matchAccounts = Object.fromEntries(
      room.members.filter((p) => p.accountId).map((p) => [p.id, p.accountId!]),
    );
    this.changed(room);
  }
  lobby(room: Room, actor: Member) {
    this.host(room, actor);
    if (room.game && !room.game.state.result)
      throw new Error('Finish the battle before returning to the lobby.');
    room.game = null;
    room.members = room.members.filter((p) => !p.bot && p.connected);
    room.members.forEach((p) => {
      p.ready = false;
      p.commands.clear();
    });
    this.changed(room);
  }
  reconnect(code: string, token: string, socketId: string) {
    const room = this.get(code),
      member = room.members.find((m) => m.token === token && !m.bot);
    if (!member) throw new Error('Invalid reconnection token.');
    const previous = member.socketId;
    member.socketId = socketId;
    member.connected = true;
    member.disconnectedAt = 0;
    const f = room.game?.state.fighters.find((p) => p.id === member.id);
    if (f) f.connected = true;
    this.changed(room);
    return { room, member, previous };
  }
  disconnect(room: Room, member: Member) {
    member.connected = false;
    member.socketId = null;
    member.disconnectedAt = Date.now();
    const f = room.game?.state.fighters.find((p) => p.id === member.id);
    if (f) f.connected = false;
    this.changed(room);
  }
  leave(room: Room, member: Member) {
    this.disconnect(room, member);
    if (room.game && !room.game.state.result) {
      const f = room.game.state.fighters.find((p) => p.id === member.id);
      if (f) f.hp = 0;
      room.game.checkWin();
    }
    member.token = '';
    room.members = room.members.filter((m) => m.id !== member.id);
    if (room.hostId === member.id)
      room.hostId =
        room.members.find((p) => !p.bot && p.connected)?.id ?? room.members[0]?.id ?? '';
    if (!room.members.some((m) => !m.bot)) this.rooms.delete(room.code);
    this.changed(room);
  }
  host(room: Room, member: Member) {
    if (room.hostId !== member.id) throw new Error('Only the host can do that.');
  }
  changed(room: Room) {
    room.updatedAt = Date.now();
  }
  snapshot(room: Room, viewerId?: string): RoomState {
    const clean = (p: LobbyPlayer): LobbyPlayer => ({
      id: p.id,
      name: p.name,
      tank: p.tank,
      team: p.team,
      ready: p.ready,
      connected: p.connected,
      bot: p.bot,
    });
    let match = room.game ? structuredClone(room.game.state) : null;
    if (match) {
      const viewer = match.fighters.find((f) => f.id === viewerId);
      for (const f of match.fighters)
        if (
          f.statuses.cloak &&
          f.id !== viewerId &&
          !(match.config.mode === 'teams' && viewer?.team === f.team)
        ) {
          f.x = -1000;
          f.y = -1000;
        }
    }
    return {
      serverTime: Date.now(),
      code: room.code,
      hostId: room.hostId,
      config: { ...room.config },
      phase: !match ? 'lobby' : match.result ? 'results' : 'battle',
      players: room.members.map(clean),
      match,
      passwordProtected: !!room.passwordHash,
    };
  }
  async record(room: Room) {
    if (room.recorded || room.recording || !room.game?.state.result) return;
    const match = room.game.state;
    room.recording = true;
    try {
      await this.store.record(match.id, match.result!, room.matchAccounts ?? {});
      if (room.game?.state.id === match.id) room.recorded = true;
    } finally {
      room.recording = false;
    }
  }
  sweep(now = Date.now()) {
    const changed: Room[] = [];
    for (const room of this.rooms.values()) {
      const host = room.members.find((m) => m.id === room.hostId);
      if (host && !host.connected && now - host.disconnectedAt > 30000) {
        const next = room.members.find((m) => !m.bot && m.connected);
        if (next) {
          room.hostId = next.id;
          changed.push(room);
        }
      }
      if (!room.members.some((m) => !m.bot && m.connected) && now - room.updatedAt > 120000)
        this.rooms.delete(room.code);
      if (!room.game) {
        const count = room.members.length;
        room.members = room.members.filter((m) => m.connected || now - m.disconnectedAt < 120000);
        if (room.members.length !== count) changed.push(room);
      }
    }
    return changed;
  }
}
