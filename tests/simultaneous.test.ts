import { describe, it, expect } from 'vitest';
import { RoundGame } from '../server/src/game/rounds';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import { projectile } from '../shared/src/physics/projectile';
import { WEAPONS } from '../shared/src/configs/weapons';
import { Terrain } from '../shared/src/maps/terrain';
import type { LobbyPlayer } from '../shared/src/types';
const players: LobbyPlayer[] = [
  { id: 'a', name: 'Alpha', tank: 'titan', team: 0, ready: true, connected: true, bot: false },
  { id: 'b', name: 'Bravo', tank: 'phantom', team: 1, ready: true, connected: true, bot: false },
];
const game = () =>
  new RoundGame(players, { ...DEFAULT_CONFIG, map: 'desert', maxPlayers: 2 }, 42, 1000);
const lock = (weapon = 'heavy') => ({
  type: 'lock' as const,
  round: 1,
  angle: 42,
  power: 61,
  weapon,
  ability: false,
});
describe('Simultaneous vertical slice', () => {
  it('seals plans, hides them in opponent snapshots, and forbids later movement or edits', () => {
    const g = game();
    g.action('a', lock(), 1100);
    expect(g.snapshot('a').ownPlan?.power).toBe(61);
    const other = g.snapshot('b');
    expect(other.ownPlan).toBeUndefined();
    expect(other.fighters[0].power).toBe(0);
    expect(other.fighters[0].weapons).toEqual({});
    expect(other.shots).toEqual([]);
    expect(() => g.action('a', { type: 'move', direction: 1, distance: 2 }, 1101)).toThrow(
      'locked',
    );
    expect(() => g.action('a', lock(), 1101)).toThrow('locked');
  });
  it('reveals both weapons only after all players lock and commits a shared final terrain', () => {
    const g = game();
    const before = g.state.terrain;
    g.action('a', lock(), 1100);
    g.action('b', { ...lock('shadow'), angle: 138 }, 1200);
    expect(g.state.phase).toBe('resolving');
    expect(g.state.shots.map((s) => s.weapon)).toEqual(['heavy', 'shadow']);
    expect(g.state.terrain).toEqual(before);
    expect(g.state.shots.every((s) => s.impactMs! > s.launchMs!)).toBe(true);
    expect(g.tick(g.state.resolveAt + 1)).toBe(true);
    expect(g.state.turn).toBe(2);
    expect(g.state.terrain).toEqual(g.terrain.pack());
    expect(g.state.readyIds).toEqual([]);
    expect(g.snapshot('a').ownPlan).toBeUndefined();
  });
  it('fires a lethal simultaneous volley from both tanks and declares a draw', () => {
    const g = game();
    g.state.environment!.cover = [];
    g.state.environment!.wind = 0;
    g.terrain = new Terrain();
    for (let y = 100; y < 180; y++) for (let x = 0; x < 360; x++) g.terrain.data[y * 360 + x] = 1;
    const [a, b] = g.state.fighters;
    a.x = 600;
    b.x = 650;
    a.y = b.y = 380;
    a.hp = b.hp = 1;
    g.action('a', { ...lock(), angle: 5, power: 10 }, 1100);
    g.action('b', { ...lock('shadow'), angle: 175, power: 10 }, 1100);
    expect(new Set(g.state.shots.map((s) => s.owner)).size).toBe(2);
    g.tick(g.state.resolveAt + 1);
    expect(g.state.result?.draw).toBe(true);
  });
  it('timeouts and disconnections submit passes and reconnect does not leak plans', () => {
    const g = game();
    g.action('a', lock(), 1100);
    g.state.fighters[1].connected = false;
    g.tick(1200);
    expect(g.state.phase).toBe('resolving');
    g.state.fighters[1].connected = true;
    g.tick(g.state.resolveAt + 1);
    expect(g.state.fighters[1].connected).toBe(true);
    g.tick(g.state.deadline + 1);
    expect(g.state.phase).toBe('resolving');
  });
  it('wind changes authoritative flight, and fast lance differs from siege cannon', () => {
    const g = game(),
      env = g.state.environment!;
    env.cover = [];
    const args = [
      { x: 100, y: 100 },
      45,
      70,
      WEAPONS.heavy,
      245,
      new Terrain(),
      [] as import('../shared/src/types').Fighter[],
      'a',
      false,
    ] as const;
    const left = projectile(...args, { ...env, wind: -35 }),
      right = projectile(...args, { ...env, wind: 35 });
    expect(left.impact.x).not.toBe(right.impact.x);
    const lance = projectile({ ...args[0] }, 45, 70, WEAPONS.shadow, 245, new Terrain(), [], 'a');
    expect(lance.durationMs).not.toBe(left.durationMs);
  });
  it('rejects old rounds, unavailable weapons and nonplanning commands', () => {
    const g = game();
    expect(() => g.action('a', { ...lock(), round: 9 }, 1100)).toThrow('round');
    expect(() => g.action('a', lock('electric'), 1100)).toThrow('equipped');
    expect(() => g.action('a', lock('__proto__'), 1100)).toThrow('equipped');
    expect(() => g.action('a', { type: 'ability' }, 1100)).toThrow('lock');
  });
});
