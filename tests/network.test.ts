import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createArena } from '../server/src/networking/server';
import { Store } from '../server/src/persistence/store';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import type { Reply, RoomState } from '../shared/src/types';
let arena: Awaited<ReturnType<typeof createArena>>, url: string;
const sockets: Socket[] = [];
async function client() {
  const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', reject);
  });
  return s;
}
function req(s: Socket, event: string, data: unknown = {}): Promise<Reply> {
  return new Promise((resolve, reject) =>
    s.timeout(3000).emit(event, data, (e: Error | null, r: Reply) => (e ? reject(e) : resolve(r))),
  );
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function makePair() {
  const a = await client(),
    b = await client();
  const ar = await req(a, 'create', { name: 'Alpha' });
  const br = await req(b, 'join', { name: 'Bravo', code: ar.room!.code });
  return { a, b, ar, br };
}
async function start(
  a: Socket,
  b: Socket,
  config = { ...DEFAULT_CONFIG, combatFlow: 'turns', maxPlayers: 2, map: 'desert' },
) {
  expect((await req(a, 'configure', config)).ok).toBe(true);
  await req(a, 'ready', true);
  await req(b, 'ready', true);
  expect((await req(a, 'start')).ok).toBe(true);
}
beforeAll(async () => {
  arena = await createArena({ store: new Store(), tickMs: 20, creationLimit: 200 });
  await new Promise<void>((resolve) => arena.http.listen(0, '127.0.0.1', () => resolve()));
  url = `http://127.0.0.1:${(arena.http.address() as any).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await arena.close();
});
describe('Actual Socket.IO multiplayer integration', () => {
  it('keeps simultaneous plans private across actual clients, reconnects, and isolated rooms', async () => {
    const p = await makePair(),
      q = await makePair();
    await start(p.a, p.b, {
      ...DEFAULT_CONFIG,
      combatFlow: 'simultaneous',
      maxPlayers: 2,
      map: 'desert',
    });
    await start(q.a, q.b, {
      ...DEFAULT_CONFIG,
      combatFlow: 'simultaneous',
      maxPlayers: 2,
      map: 'desert',
    });
    const game = arena.rooms.get(p.ar.room!.code).game!,
      other = arena.rooms.get(q.ar.room!.code).game!;
    const before = JSON.stringify(other.state);
    let snapshot: RoomState | undefined;
    p.b.on('state', (s) => (snapshot = s));
    const submit = await req(p.a, 'command', {
      id: 'sealed-a',
      command: {
        type: 'lock',
        round: 1,
        angle: 47,
        power: 63,
        weapon: 'standard',
        ability: false,
        superpower: true,
      },
    });
    expect(submit.ok).toBe(true);
    expect(
      (
        await req(p.a, 'command', {
          id: 'sealed-a',
          command: {
            type: 'lock',
            round: 1,
            angle: 47,
            power: 63,
            weapon: 'standard',
            ability: false,
            superpower: true,
          },
        })
      ).ok,
    ).toBe(false);
    await sleep(40);
    expect(snapshot!.match!.ownPlan).toBeUndefined();
    expect(snapshot!.match!.fighters.find((f) => f.id === p.ar.playerId)!.power).toBe(0);
    expect(snapshot!.match!.shots).toHaveLength(0);
    expect(snapshot!.match!.superEvents ?? []).toEqual([]);
    expect(snapshot!.match!.fighters.find((f) => f.id === p.ar.playerId)!.superpowerUsed).toBe(
      false,
    );
    const reconnect = await client(),
      resumed = await req(reconnect, 'resume', { code: p.ar.room!.code, token: p.ar.token });
    expect(resumed.room!.match!.ownPlan?.power).toBe(63);
    expect(resumed.room!.match!.ownPlan?.superpower).toBe(true);
    expect(
      (
        await req(reconnect, 'command', {
          id: 'illegal-edit',
          command: { type: 'move', direction: 1, distance: 2 },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await req(p.b, 'command', {
          id: 'sealed-b',
          command: {
            type: 'lock',
            round: 1,
            angle: 133,
            power: 63,
            weapon: 'standard',
            ability: false,
          },
        })
      ).ok,
    ).toBe(true);
    expect(game.state.phase).toBe('resolving');
    expect(new Set(game.state.shots.map((s) => s.owner)).size).toBe(2);
    expect(JSON.stringify(other.state)).toBe(before);
    game.tick(game.state.resolveAt + 1);
    expect(game.state.turn).toBe(2);
    expect(game.state.readyIds).toEqual([]);
    const again = await client();
    const restored = await req(again, 'resume', { code: p.ar.room!.code, token: p.ar.token });
    expect(restored.room!.match!.fighters.find((f) => f.id === p.ar.playerId)!.superpowerUsed).toBe(
      true,
    );
    expect(
      (
        await req(again, 'command', {
          id: 'super-again',
          command: {
            type: 'lock',
            round: 2,
            angle: 47,
            power: 63,
            weapon: 'standard',
            ability: false,
            superpower: true,
          },
        })
      ).ok,
    ).toBe(false);
  });
  it('creates a coded room, joins friends and hides private tokens', async () => {
    const { a, ar, br } = await makePair();
    expect(ar.room!.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(br.room!.players).toHaveLength(2);
    expect(JSON.stringify(br.room)).not.toContain(ar.token);
    expect(
      (await req(a, 'configure', { ...DEFAULT_CONFIG, combatFlow: 'turns', maxPlayers: 9 })).ok,
    ).toBe(false);
  });
  it('validates password, host authority, readiness and balanced teams', async () => {
    const a = await client(),
      b = await client();
    const ar = await req(a, 'create', { name: 'Host', password: 'room-key' });
    expect(
      (await req(b, 'join', { code: ar.room!.code, name: 'Guest', password: 'wrong' })).ok,
    ).toBe(false);
    expect(
      (await req(b, 'join', { code: ar.room!.code, name: 'Guest', password: 'room-key' })).ok,
    ).toBe(true);
    expect((await req(b, 'configure', DEFAULT_CONFIG)).ok).toBe(false);
    expect((await req(a, 'start')).ok).toBe(false);
    expect(
      (
        await req(a, 'configure', {
          ...DEFAULT_CONFIG,
          mode: 'teams',
          teams: 3,
          teamSize: 2,
          maxPlayers: 4,
        })
      ).ok,
    ).toBe(false);
  });
  it('synchronizes authoritative shots and terrain while isolating simultaneous rooms', async () => {
    const p = await makePair(),
      q = await makePair();
    await start(p.a, p.b);
    await start(q.a, q.b);
    const rp = arena.rooms.get(p.ar.room!.code),
      rq = arena.rooms.get(q.ar.room!.code),
      before = JSON.stringify(rq.game!.state);
    let stateB: RoomState | undefined;
    p.b.on('state', (s) => (stateB = s));
    expect(
      (
        await req(p.b, 'command', {
          id: 'wrong-turn-1',
          command: { type: 'fire', angle: 45, power: 50, weapon: 'standard' },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await req(p.a, 'command', {
          id: 'invalid-angle-1',
          command: { type: 'fire', angle: NaN, power: 50, weapon: 'standard' },
        })
      ).ok,
    ).toBe(false);
    const command = {
      id: 'test-fire-0001',
      command: { type: 'fire', angle: 45, power: 60, weapon: 'standard' },
    };
    expect((await req(p.a, 'command', command)).ok).toBe(true);
    expect((await req(p.a, 'command', command)).ok).toBe(false);
    await sleep(60);
    expect(stateB?.match?.terrain).toEqual(rp.game!.state.terrain);
    expect(stateB?.match?.shots.length).toBe(1);
    expect(JSON.stringify(stateB)).not.toContain(p.ar.token);
    expect(JSON.stringify(rq.game!.state)).toBe(before);
  });
  it('restores the same seat and full snapshot on reconnection', async () => {
    const { a, b, ar } = await makePair();
    await start(a, b);
    a.disconnect();
    await sleep(50);
    expect(arena.rooms.get(ar.room!.code).members[0].connected).toBe(false);
    const again = await client();
    const resumed = await req(again, 'resume', { code: ar.room!.code, token: ar.token });
    expect(resumed.ok).toBe(true);
    expect(resumed.playerId).toBe(ar.playerId);
    expect(resumed.room!.match!.terrain.length).toBeGreaterThan(10);
    expect((await req(again, 'resume', { code: ar.room!.code, token: 'x'.repeat(64) })).ok).toBe(
      false,
    );
  });
  it('cannot use a room code to inject commands into another room', async () => {
    const p = await makePair(),
      q = await makePair();
    await start(p.a, p.b);
    await start(q.a, q.b);
    const bad = await req(q.a, 'command', {
      id: 'cross-room-attack',
      code: p.ar.room!.code,
      command: { type: 'pass' },
    });
    expect(bad.ok).toBe(false);
    expect(arena.rooms.get(p.ar.room!.code).game!.state.turn).toBe(1);
  });
  it('finishes a real bot match and supports rematch and return to lobby', async () => {
    const a = await client(),
      ar = await req(a, 'create', { name: 'Pilot' });
    await req(a, 'configure', {
      ...DEFAULT_CONFIG,
      maxPlayers: 2,
      bots: 1,
      map: 'desert',
      damageMultiplier: 3,
      healthMultiplier: 0.5,
    });
    await req(a, 'ready', true);
    expect((await req(a, 'start')).ok).toBe(true);
    const room = arena.rooms.get(ar.room!.code),
      g = room.game!;
    let now = Date.now();
    for (let i = 0; i < 70 && !g.state.result; i++) {
      g.state.deadline = now + 30000;
      g.botTurn(now);
      now = Math.max(now + 2500, g.state.resolveAt + 1);
      g.tick(now);
    }
    expect(g.state.result).not.toBeNull();
    const oldId = g.state.id;
    expect((await req(a, 'rematch')).ok).toBe(true);
    expect(room.game!.state.id).not.toBe(oldId);
    room.game!.state.fighters[1].hp = 0;
    room.game!.checkWin();
    expect((await req(a, 'lobby')).ok).toBe(true);
    expect(room.game).toBeNull();
  });
  it.each([2, 3, 4, 5, 6, 7, 8])('starts a %i-player free-for-all', async (n) => {
    const a = await client(),
      r = await req(a, 'create', { name: 'FFA' });
    await req(a, 'configure', {
      ...DEFAULT_CONFIG,
      combatFlow: 'turns',
      maxPlayers: n,
      bots: n - 1,
    });
    await req(a, 'ready', true);
    expect((await req(a, 'start')).ok).toBe(true);
    expect(arena.rooms.get(r.room!.code).game!.state.fighters).toHaveLength(n);
  });
  it.each([
    [2, 2],
    [2, 3],
    [2, 4],
    [3, 2],
    [4, 2],
  ])('starts %i teams of %i', async (teams, teamSize) => {
    const a = await client(),
      r = await req(a, 'create', { name: 'TeamPilot' });
    await req(a, 'configure', {
      ...DEFAULT_CONFIG,
      mode: 'teams',
      maxPlayers: teams * teamSize,
      teams,
      teamSize,
      bots: teams * teamSize - 1,
    });
    await req(a, 'ready', true);
    const started = await req(a, 'start');
    expect(started.error).toBeUndefined();
    const fs = arena.rooms.get(r.room!.code).game!.state.fighters;
    expect(fs).toHaveLength(teams * teamSize);
    for (let t = 0; t < teams; t++) expect(fs.filter((f) => f.team === t)).toHaveLength(teamSize);
  });
  it('quick matchmaking pairs two real clients', async () => {
    const a = await client(),
      b = await client();
    const r1 = await req(a, 'quick', { name: 'QuickOne' }),
      r2 = await req(b, 'quick', { name: 'QuickTwo' });
    expect(r2.room!.code).toBe(r1.room!.code);
    expect(r2.room!.phase).toBe('battle');
    expect(r2.room!.players.every((p) => !p.bot)).toBe(true);
  });
  it('phase shift is a public defensive status, with coordinates visible', async () => {
    const p = await makePair();
    await req(p.a, 'select', { tank: 'phantom', team: 0 });
    await start(p.a, p.b);
    await req(p.a, 'command', { id: 'cloak-command-0001', command: { type: 'ability' } });
    const room = arena.rooms.get(p.ar.room!.code);
    expect(arena.rooms.snapshot(room, p.br.playerId).match!.fighters[0].statuses.phase).toBe(2);
    expect(arena.rooms.snapshot(room, p.br.playerId).match!.fighters[0].x).toBeGreaterThan(0);
    expect(arena.rooms.snapshot(room, p.ar.playerId).match!.fighters[0].x).toBeGreaterThan(0);
  });
});
describe('Persistent account API', () => {
  it('registers, authenticates and returns career statistics without passwords', async () => {
    const post = (route: string, data: unknown) =>
      fetch(url + '/api/auth/' + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    const r = await post('register', { name: 'TestPilot', password: 'safe-test-password' }),
      data = await r.json();
    expect(r.ok).toBe(true);
    expect(data.token).toHaveLength(64);
    expect(data.hash).toBeUndefined();
    expect((await post('login', { name: 'TestPilot', password: 'wrong-password' })).ok).toBe(false);
    const login = await post('login', { name: 'TestPilot', password: 'safe-test-password' });
    expect(login.ok).toBe(true);
    const profile = await fetch(url + '/api/profile', {
      headers: { Authorization: 'Bearer ' + data.token },
    });
    expect((await profile.json()).games).toBe(0);
    expect((await fetch(url + '/api/profile')).status).toBe(401);
  });
});
