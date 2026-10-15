import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../server/src/game/engine';
import { Store } from '../server/src/persistence/store';
import { Rooms } from '../server/src/rooms/manager';
import { Limiter } from '../server/src/security/validation';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import { WEAPONS } from '../shared/src/configs/weapons';
import { TANKS } from '../shared/src/configs/tanks';
import { projectile } from '../shared/src/physics/projectile';
import { Terrain, COLS, ROWS } from '../shared/src/maps/terrain';
import type { LobbyPlayer, TankId } from '../shared/src/types';
const p = (id: string, tank: TankId = 'titan', team = 0): LobbyPlayer => ({
  id,
  name: id,
  tank,
  team,
  connected: true,
  ready: true,
  bot: false,
});
const g = (tank: TankId = 'titan') =>
  new Game(
    [p('a', tank, 0), p('b', 'titan', 1)],
    { ...DEFAULT_CONFIG, maxPlayers: 2, map: 'desert' },
    41,
    1000,
  );
describe('Weapon behavior and combat edge cases', () => {
  it.each(Object.values(WEAPONS))('$name causes damage on a direct collision', (w) => {
    const game = g();
    const [a, b] = game.state.fighters;
    a.x = 400;
    a.y = 204;
    b.x = 465;
    b.y = 204;
    game.terrain = new Terrain();
    game.terrain.data.fill(1, 54 * COLS);
    a.weapons[w.id] = { ammo: 3, cooldown: 0 };
    game.action('a', { type: 'fire', weapon: w.id, angle: 5, power: 100 }, 1001);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.stats.damage).toBeGreaterThan(0);
  });
  it('cluster and barrage create distinct projectile counts', () => {
    const game = g('viper');
    game.action('a', { type: 'ability' }, 1001);
    game.action('a', { type: 'fire', weapon: 'cluster', angle: 45, power: 50 }, 1002);
    expect(game.state.shots).toHaveLength(5);
    const normal = g('viper');
    normal.action('a', { type: 'fire', weapon: 'cluster', angle: 45, power: 50 }, 1002);
    expect(normal.state.shots).toHaveLength(3);
  });
  it('overcharge increases attack damage and is consumed', () => {
    const base = g('nova'),
      boosted = g('nova');
    for (const game of [base, boosted]) {
      game.actor.x = 400;
      game.actor.y = 204;
      game.state.fighters[1].x = 470;
      game.state.fighters[1].y = 204;
      game.terrain = new Terrain();
      game.terrain.data.fill(1, 54 * COLS);
    }
    boosted.action('a', { type: 'ability' }, 1001);
    for (const game of [base, boosted])
      game.action('a', { type: 'fire', weapon: 'charged', angle: 5, power: 100 }, 1002);
    expect(boosted.actor.stats.damage).toBeGreaterThan(base.actor.stats.damage);
    expect(boosted.actor.statuses.overcharge).toBeUndefined();
  });
  it('medic heals a teammate, rejects enemies and respects the health cap', () => {
    const game = new Game(
      [p('a', 'medic', 0), p('b', 'titan', 0), p('c', 'titan', 1), p('d', 'titan', 1)],
      { ...DEFAULT_CONFIG, mode: 'teams' },
      41,
      1000,
    );
    const ally = game.state.fighters.find((f) => f.id === 'b')!;
    ally.x = game.actor.x + 100;
    ally.hp -= 20;
    expect(() => game.action('a', { type: 'ability', targetId: 'c' }, 1001)).toThrow('ally');
    expect(game.actor.energy).toBe(100);
    game.action('a', { type: 'ability', targetId: 'b' }, 1002);
    expect(ally.hp).toBe(ally.maxHp);
  });
  it('energy shield also protects a nearby teammate', () => {
    const game = new Game(
      [p('a', 'bastion', 0), p('b', 'titan', 0), p('c', 'titan', 1), p('d', 'titan', 1)],
      { ...DEFAULT_CONFIG, mode: 'teams' },
      41,
      1000,
    );
    const ally = game.state.fighters.find((f) => f.id === 'b')!;
    ally.x = game.actor.x + 100;
    game.action('a', { type: 'ability' }, 1001);
    expect(ally.statuses.shield).toBe(40);
    expect(game.state.fighters.find((f) => f.id === 'c')!.statuses.shield).toBeUndefined();
  });
  it('a ricochet visibly changes vertical direction after impact', () => {
    const terrain = new Terrain();
    for (let row = 100; row < ROWS; row++) terrain.data.fill(1, row * COLS, (row + 1) * COLS);
    const f = projectile({ x: 100, y: 350 }, 30, 40, WEAPONS.bouncing, 245, terrain, [], 'a');
    const nearGround = f.path.findIndex((pt) => pt.y > 390);
    expect(nearGround).toBeGreaterThan(0);
    expect(f.path.slice(nearGround + 1).some((pt) => pt.y < 380)).toBe(true);
  });
  it('piercing ammunition travels farther through terrain than a standard impact', () => {
    const terrain = new Terrain(new Uint8Array(COLS * ROWS).fill(1));
    const standard = projectile(
        { x: 100, y: 300 },
        10,
        70,
        WEAPONS.standard,
        245,
        terrain,
        [],
        'a',
      ),
      piercing = projectile({ x: 100, y: 300 }, 10, 70, WEAPONS.piercing, 245, terrain, [], 'a');
    expect(piercing.impact.x).toBeGreaterThan(standard.impact.x);
  });
  it('weapon cooldown decreases on the owner’s turns and ammo stays spent', () => {
    const game = g();
    game.action('a', { type: 'fire', weapon: 'guided', angle: 45, power: 50 }, 1001);
    expect(game.actor.weapons.guided.ammo).toBe(1);
    const resolved = game.state.resolveAt + 1;
    game.tick(resolved);
    game.action('b', { type: 'pass' }, resolved + 1);
    expect(game.actor.weapons.guided.cooldown).toBe(2);
    expect(game.actor.weapons.guided.ammo).toBe(1);
  });
  it('ability cooldown and freeze impose actual turn constraints', () => {
    const game = g();
    game.actor.statuses.freeze = 2;
    game.action('a', { type: 'move', direction: 1, distance: 100 }, 1001);
    expect(game.actor.moved).toBeLessThanOrEqual(TANKS.titan.mobility * 0.3);
    game.action('a', { type: 'ability' }, 1002);
    game.action('a', { type: 'pass' }, 1003);
    game.action('b', { type: 'pass' }, 1004);
    expect(game.actor.cooldown).toBe(3);
    expect(() => game.action('a', { type: 'ability' }, 1005)).toThrow('cooling');
  });
});
describe('Room lifecycle and persistence', () => {
  it('transfers host after disconnect grace, then expires abandoned rooms', () => {
    const rooms = new Rooms(new Store()),
      { room, member } = rooms.create('One', 'socket1');
    const { member: two } = rooms.join(room.code, 'Two', 'socket2');
    rooms.disconnect(room, member);
    rooms.sweep(Date.now() + 31000);
    expect(room.hostId).toBe(two.id);
    rooms.disconnect(room, two);
    rooms.sweep(Date.now() + 130000);
    expect(rooms.rooms.size).toBe(0);
  });
  it('a connection takeover does not create a duplicate seat', () => {
    const rooms = new Rooms(new Store()),
      { room, member } = rooms.create('One', 'first');
    const resumed = rooms.reconnect(room.code, member.token, 'second');
    expect(resumed.previous).toBe('first');
    expect(room.members).toHaveLength(1);
    expect(member.socketId).toBe('second');
  });
  it('rate limiter resets only after the configured window', () => {
    const l = new Limiter(2, 1000);
    expect(l.allow('a', 100)).toBe(true);
    expect(l.allow('a', 101)).toBe(true);
    expect(l.allow('a', 102)).toBe(false);
    expect(l.allow('b', 102)).toBe(true);
    expect(l.allow('a', 1101)).toBe(true);
  });
  it('accounts and recorded matches survive a process-store restart', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tank-arena-test-'));
    try {
      const file = path.join(dir, 'store.json'),
        store = new Store(file);
      await store.init();
      const session = await store.register('PersistentPilot', 'test-password-123');
      const account = store.account(session.token)!;
      const game = g();
      game.state.fighters[1].hp = 0;
      game.checkWin(2000);
      await store.record(game.state.id, game.state.result!, { a: account.id });
      await store.record(game.state.id, game.state.result!, { a: account.id });
      await store.close();
      const restored = new Store(file);
      await restored.init();
      expect(restored.profile(session.token).games).toBe(1);
      expect(restored.profile(session.token).wins).toBe(1);
      expect((await restored.login('PersistentPilot', 'test-password-123')).token.length).toBe(64);
      await restored.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
