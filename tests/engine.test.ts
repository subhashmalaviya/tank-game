import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game/engine';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import { generateMap, Terrain, HEIGHT } from '../shared/src/maps/terrain';
import { projectile } from '../shared/src/physics/projectile';
import { WEAPONS } from '../shared/src/configs/weapons';
import { MAPS } from '../shared/src/configs/maps';
import { TANK_IDS, TANKS } from '../shared/src/configs/tanks';
import type { LobbyPlayer, TankId } from '../shared/src/types';
const players = (n = 2, tank: TankId = 'titan'): LobbyPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    tank,
    team: i % 2,
    ready: true,
    connected: true,
    bot: false,
  }));
const game = (tank: TankId = 'titan', n = 2) =>
  new Game(players(n, tank), { ...DEFAULT_CONFIG, maxPlayers: n, map: 'desert' }, 42, 1000);
describe('Phase 1: playable artillery loop', () => {
  it('shoots, deforms terrain, resolves and advances turn', () => {
    const g = game(),
      before = g.state.terrain.join(',');
    g.action('p0', { type: 'fire', angle: 45, power: 45, weapon: 'heavy' }, 1001);
    expect(g.state.shots[0].path.length).toBeGreaterThan(3);
    expect(g.state.terrain.join(',')).not.toBe(before);
    expect(g.state.resolveAt).toBeGreaterThan(1001);
    g.tick(g.state.resolveAt + 1);
    expect(g.state.activeId).toBe('p1');
  });
  it('validates turns, motion budget and shot resolution lock', () => {
    const g = game();
    expect(() => g.action('p1', { type: 'pass' }, 1001)).toThrow('turn');
    g.action('p0', { type: 'move', direction: 1, distance: 30 }, 1001);
    expect(g.actor.moved).toBeGreaterThan(0);
    g.action('p0', { type: 'fire', angle: 80, power: 20, weapon: 'heavy' }, 1002);
    expect(() => g.action('p0', { type: 'pass' }, 1003)).toThrow('resolving');
  });
  it('expires turns and skips eliminated tanks', () => {
    const g = game('titan', 3);
    g.state.fighters[1].hp = 0;
    g.tick(40000);
    expect(g.state.activeId).toBe('p2');
  });
  it('cannot tunnel through a thin wall at high speed', () => {
    const t = new Terrain();
    for (let y = 0; y < 180; y++) t.data[y * 360 + 60] = 1;
    const f = projectile({ x: 100, y: 200 }, 5, 100, WEAPONS.standard, 245, t, [], 'x');
    expect(f.hit).toBe(true);
    expect(f.impact.x).toBeLessThan(245);
  });
  it('settles tanks after support is removed', () => {
    const g = game();
    const y = g.actor.y;
    g.terrain.crater(g.actor.x, y + 20, 65);
    g.settle();
    expect(g.actor.y).toBeGreaterThan(y);
  });
});
describe('Phase 2: all tanks and weapons', () => {
  for (const id of TANK_IDS)
    it(`${id} ability applies its distinct effect, cost and cooldown`, () => {
      const g = game(id),
        a = g.actor,
        b = g.state.fighters[1];
      b.x = a.x + 100;
      b.y = a.y;
      a.hp -= 45;
      g.action(a.id, { type: 'ability' }, 1001);
      expect(a.energy).toBe(100 - TANKS[id].ability.cost);
      expect(a.cooldown).toBeGreaterThan(0);
      expect(() => g.action(a.id, { type: 'ability' }, 1002)).toThrow('cooling');
      if (id === 'titan') expect(a.statuses.fortify).toBe(2);
      if (id === 'phantom') expect(a.statuses.phase).toBe(2);
      if (id === 'volt') expect(b.statuses.emp).toBe(2);
      if (id === 'inferno') expect(g.state.hazards.some((h) => h.kind === 'fire')).toBe(true);
      if (id === 'frostbite') expect(b.statuses.freeze).toBe(2);
      if (id === 'viper') expect(a.statuses.hunter).toBe(3);
      if (id === 'nova') expect(a.statuses.overcharge).toBe(3);
      if (id === 'bastion') expect(a.statuses.shield).toBe(40);
      if (id === 'medic') expect(a.hp).toBe(a.maxHp - 9);
      if (id === 'quake') expect(b.hp).toBeLessThan(b.maxHp);
    });
  it('rejects EMP and insufficient energy without consuming a cooldown', () => {
    const g = game();
    g.actor.statuses.emp = 2;
    expect(() => g.action('p0', { type: 'ability' }, 1001)).toThrow('EMP');
    delete g.actor.statuses.emp;
    g.actor.energy = 0;
    expect(() => g.action('p0', { type: 'ability' }, 1001)).toThrow('energy');
    expect(g.actor.cooldown).toBe(0);
  });
  it('fortify, armor, shield and piercing modify damage', () => {
    const g = game(),
      t = g.actor;
    expect(g.damage(t, 20)).toBe(16);
    t.statuses.fortify = 2;
    expect(g.damage(t, 20)).toBe(7);
    delete t.statuses.fortify;
    t.statuses.shield = 40;
    expect(g.damage(t, 20)).toBe(0);
    delete t.statuses.shield;
    expect(g.damage(t, 20, undefined, true)).toBe(20);
  });
  for (const w of Object.values(WEAPONS))
    it(`${w.id} resolves a finite projectile path`, () => {
      const g = game();
      const f = projectile(g.actor, 45, 60, w, 245, g.terrain, g.state.fighters, 'p0');
      expect(f.path.length).toBeGreaterThan(1);
      expect(Number.isFinite(f.impact.x)).toBe(true);
    });
  it('validates ammunition and equipment', () => {
    const g = game();
    expect(() =>
      g.action('p0', { type: 'fire', angle: 45, power: 50, weapon: 'charged' }, 1001),
    ).toThrow('equipped');
    g.actor.weapons.guided.ammo = 0;
    expect(() =>
      g.action('p0', { type: 'fire', angle: 45, power: 50, weapon: 'guided' }, 1001),
    ).toThrow('ammunition');
    g.actor.weapons.bouncing.cooldown = 1;
    expect(() =>
      g.action('p0', { type: 'fire', angle: 45, power: 50, weapon: 'bouncing' }, 1001),
    ).toThrow('cooling');
  });
});
describe('Phase 3: procedural worlds', () => {
  for (const map of MAPS)
    it(`${map.name} has reproducible, separated valid spawns for 2–8 players`, () => {
      for (let n = 2; n <= 8; n++) {
        const a = generateMap(876, map.id, n),
          b = generateMap(876, map.id, n);
        expect(a.terrain.pack()).toEqual(b.terrain.pack());
        expect(Terrain.unpack(a.terrain.pack()).data).toEqual(a.terrain.data);
        for (const [i, p] of a.spawns.entries()) {
          expect(p.y).toBeLessThan(HEIGHT - 24);
          expect(a.terrain.solid(p.x, p.y)).toBe(false);
          expect(a.terrain.solid(p.x, p.y + 12)).toBe(true);
          expect(a.hazards.every((h) => Math.abs(h.x - p.x) > h.radius + 24)).toBe(true);
          if (i) expect(p.x - a.spawns[i - 1].x).toBeGreaterThan(100);
        }
      }
      expect(generateMap(1, map.id, 4).terrain.pack()).not.toEqual(
        generateMap(2, map.id, 4).terrain.pack(),
      );
    });
  it('craters remove a circle without changing distant cells', () => {
    const t = new Terrain(new Uint8Array(360 * 180).fill(1));
    t.crater(200, 200, 40);
    expect(t.solid(200, 200)).toBe(false);
    expect(t.solid(240, 240)).toBe(true);
  });
});
describe('Phase 4: team and match rules', () => {
  it.each([4, 6, 8])('supports balanced %i-player team matches', (n) => {
    const g = new Game(
      players(n),
      { ...DEFAULT_CONFIG, mode: 'teams', teams: 2, teamSize: n / 2, maxPlayers: n },
      42,
      1000,
    );
    for (const f of g.state.fighters) if (f.team === 1) f.hp = 0;
    g.checkWin(2000);
    expect(g.state.result?.winnerIds.length).toBe(n / 2);
  });
  it('handles simultaneous elimination as a draw', () => {
    const g = game();
    g.state.fighters.forEach((f) => (f.hp = 0));
    g.checkWin(2000);
    expect(g.state.result?.draw).toBe(true);
  });
  it('protects allies when friendly fire is disabled', () => {
    const g = new Game(players(4), { ...DEFAULT_CONFIG, mode: 'teams' }, 42, 1000);
    expect(
      g.canDamage(
        g.state.fighters[0],
        g.state.fighters.find((f) => f.id === 'p2')!,
      ),
    ).toBe(false);
  });
  it('skips disconnected players and accepts reconnects', () => {
    const g = game('titan', 3);
    g.state.fighters[1].connected = false;
    g.action('p0', { type: 'pass' }, 1001);
    expect(g.state.activeId).toBe('p2');
    g.state.fighters[1].connected = true;
    g.action('p2', { type: 'pass' }, 1002);
    g.action('p0', { type: 'pass' }, 1003);
    expect(g.state.activeId).toBe('p1');
  });
  it('ends on the duration limit and explicitly draws ties', () => {
    const g = game();
    g.tick(1000 + 16 * 60000);
    expect(g.state.result?.draw).toBe(true);
  });
});
