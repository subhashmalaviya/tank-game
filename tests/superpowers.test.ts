import { describe, it, expect } from 'vitest';
import { RoundGame } from '../server/src/game/rounds';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import { SUPERPOWERS } from '../shared/src/configs/superpowers';
import { TANK_IDS } from '../shared/src/configs/tanks';
import { WEAPONS } from '../shared/src/configs/weapons';
import { Terrain } from '../shared/src/maps/terrain';
import { projectile } from '../shared/src/physics/projectile';
import { resolveSupers, type SuperDamage } from '../server/src/game/superpowers';
import type { TankId, Plan } from '../shared/src/types';
function game(tank: TankId = 'titan', count = 2) {
  const g = new RoundGame(
    Array.from({ length: count }, (_, i) => ({
      id: String(i),
      name: 'P' + i,
      tank: i === 0 ? tank : 'titan',
      team: i,
      connected: true,
      bot: false,
      ready: true,
    })),
    { ...DEFAULT_CONFIG, map: 'desert', maxPlayers: count },
    42,
    1000,
  );
  g.terrain = new Terrain();
  g.terrain.data.fill(1, 100 * 360);
  g.state.terrain = g.terrain.pack();
  g.state.hazards = [];
  g.state.environment!.cover = [];
  g.state.environment!.wind = 0;
  g.state.fighters.forEach((f, i) => {
    f.x = 300 + i * 150;
    f.y = 388;
  });
  return g;
}
const plan = (x = 400): Plan => ({
  round: 1,
  angle: 85,
  power: 10,
  weapon: 'standard',
  ability: false,
  superpower: true,
  superTargetX: x,
});
function activate(g: RoundGame, x = 400) {
  const damage: SuperDamage[] = [];
  const shields = resolveSupers(g.state, g.terrain, new Map([['0', plan(x)]]), damage);
  return { damage, shields };
}
describe('Signature superpowers', () => {
  it('provides one exclusive signature for every tank', () => {
    expect(Object.keys(SUPERPOWERS).sort()).toEqual([...TANK_IDS].sort());
    expect(new Set(Object.values(SUPERPOWERS).map((p) => p.name)).size).toBe(10);
  });
  it.each(TANK_IDS)(
    '%s is sealed, consumed once, persists across reconnect and resets only for a new match',
    (tank) => {
      const g = game(tank);
      g.action('0', { type: 'lock', ...plan(370) }, 1100);
      expect(g.snapshot('0').ownPlan?.superpower).toBe(true);
      expect(g.snapshot('1').ownPlan).toBeUndefined();
      expect(g.snapshot('1').superEvents ?? []).toEqual([]);
      expect(g.snapshot('1').fighters[0].superpowerUsed).toBe(false);
      expect(() => g.action('0', { type: 'lock', ...plan(370) }, 1101)).toThrow('locked');
      g.state.fighters[0].connected = false;
      expect(g.snapshot('0').ownPlan?.superpower).toBe(true);
      g.state.fighters[0].connected = true;
      g.action('1', { type: 'pass' }, 1200);
      expect(g.state.fighters[0].superpowerUsed).toBe(true);
      expect(g.state.superEvents).toHaveLength(1);
      g.tick(g.state.resolveAt + 1);
      expect(g.snapshot('0').fighters[0].superpowerUsed).toBe(true);
      if (!g.state.result)
        expect(() =>
          g.action(
            '0',
            { type: 'lock', ...plan(370), round: 2, weapon: 'ice' },
            g.state.deadline - 1,
          ),
        ).toThrow('already used');
      expect(game(tank).state.fighters[0].superpowerUsed).toBe(false);
    },
  );
  it('rejects out of range, airborne, overlapping and EMP-blocked jumps before consuming', () => {
    const g = game('phantom');
    for (const x of [1300, 450])
      expect(() => g.action('0', { type: 'lock', ...plan(x) }, 1100)).toThrow();
    g.terrain.crater(370, 500, 400);
    expect(() => g.action('0', { type: 'lock', ...plan(370) }, 1100)).toThrow();
    g.state.fighters[0].statuses.emp = 2;
    expect(() => g.action('0', { type: 'lock', ...plan(300) }, 1100)).toThrow('EMP');
    expect(g.state.fighters[0].superpowerUsed).toBe(false);
  });
  it('jump moves, damages, knocks back and excavates actual terrain', () => {
    const g = game('phantom');
    const { damage } = activate(g, 380);
    expect(g.state.fighters[0].x).toBe(380);
    expect(damage.some((d) => d.target === '1' && d.raw > 0)).toBe(true);
    expect(g.state.fighters[1].x).toBeGreaterThan(450);
    expect(g.state.shots[0].terrainRadius).toBe(50);
    expect(g.state.superEvents![0].path[14].y).toBeLessThan(250);
  });
  it('chains once per enemy with falling damage, honoring friendly fire', () => {
    const g = game('volt', 5);
    g.state.config.mode = 'teams';
    g.state.fighters[1].team = 0;
    const { damage } = activate(g);
    expect(damage.filter((d) => d.raw > 0).map((d) => d.target)).toEqual(['2', '3', '4']);
    expect(damage.filter((d) => d.raw > 0)[1].raw).toBeLessThan(
      damage.filter((d) => d.raw > 0)[0].raw,
    );
  });
  it('meteor creates server fire, impacts cover and damages nearby enemies', () => {
    const g = game('inferno');
    const { damage } = activate(g, 450);
    expect(g.state.hazards[0]).toMatchObject({ kind: 'fire', turns: 3 });
    expect(damage.some((d) => d.raw > 0)).toBe(true);
    expect(g.state.shots[0].terrainRadius).toBe(95);
  });
  it('freeze has finite duration and reduces actual movement budget', () => {
    const g = game('frostbite');
    activate(g);
    expect(g.state.fighters[1].statuses.freeze).toBe(3);
    g.action('1', { type: 'move', direction: 1, distance: 100 }, 1100);
    expect(g.state.fighters[1].moved).toBeLessThanOrEqual(54 * 0.3);
  });
  it('barrage emits five bounded independent colliding missiles', () => {
    const g = game('viper');
    const { damage } = activate(g, 450);
    expect(g.state.shots).toHaveLength(5);
    expect(new Set(g.state.shots.map((s) => s.impactMs)).size).toBeGreaterThan(1);
    expect(damage.reduce((sum, d) => sum + d.raw, 0)).toBeLessThanOrEqual(90);
    expect(g.state.shots.every((s) => s.path.length > 1)).toBe(true);
  });
  it('Bastion has separate absorption and reflection capacities', () => {
    const g = game('bastion');
    const { shields } = activate(g);
    expect(shields.get('0')).toMatchObject({ remaining: 2, directional: false });
    expect(g.state.fighters[0].statuses.shield).toBe(65);
    expect(g.state.fighters[1].statuses.shield).toBeUndefined();
  });
  it('rupture removes terrain and displaces enemies', () => {
    const g = game('quake');
    const before = g.terrain.data.reduce((a, b) => a + b, 0);
    const { damage } = activate(g, 550);
    expect(g.terrain.data.reduce((a, b) => a + b, 0)).toBeLessThan(before);
    expect(damage.some((d) => d.target === '1' && d.raw > 0)).toBe(true);
    expect(g.state.fighters[1].x).toBeGreaterThan(450);
  });
  it('repair respects max health, allies, and no revival', () => {
    const g = game('medic', 4);
    g.state.config.mode = 'teams';
    g.state.fighters[1].team = 0;
    g.state.fighters[2].team = 0;
    g.state.fighters[0].hp = 10;
    g.state.fighters[1].hp = 140;
    g.state.fighters[2].hp = 0;
    activate(g);
    expect(g.state.fighters[0].hp).toBe(75);
    expect(g.state.fighters[1].hp).toBe(150);
    expect(g.state.fighters[2].hp).toBe(0);
    expect(g.state.fighters[3].statuses.shield).toBeUndefined();
  });
  it('singularity pulls a bounded distance but stops at cover', () => {
    const g = game('nova');
    activate(g, 350);
    expect(g.state.fighters[1].x).toBeGreaterThanOrEqual(385);
    expect(g.state.fighters[1].x).toBeLessThan(450);
    const h = game('nova');
    h.state.environment!.cover = [
      {
        id: 'wall',
        x: 405,
        y: 300,
        width: 20,
        height: 100,
        hp: 100,
        maxHp: 100,
        material: 'metal',
        active: true,
      },
    ];
    activate(h, 350);
    expect(h.state.fighters[1].x).toBeGreaterThan(425);
  });
  it('two sealed jumps cannot occupy the same landing point', () => {
    const g = game('phantom');
    g.state.fighters[1].tank = 'phantom';
    g.state.fighters[1].x = 600;
    g.action('0', { type: 'lock', ...plan(450) }, 1100);
    g.action('1', { type: 'lock', ...plan(450) }, 1100);
    expect(g.state.superEvents!.filter((e) => e.cancelled)).toHaveLength(1);
    g.tick(g.state.resolveAt + 1);
    expect(Math.abs(g.state.fighters[0].x - g.state.fighters[1].x)).toBeGreaterThan(55);
    expect(g.state.fighters.every((f) => f.superpowerUsed)).toBe(true);
  });
  it('eight-player team rounds resolve all powers without leaking plans', () => {
    const g = game('titan', 8);
    g.state.config.mode = 'teams';
    g.state.config.teams = 2;
    g.state.config.teamSize = 4;
    g.state.fighters.forEach((f, i) => {
      f.team = i % 2;
      f.tank = ['titan', 'bastion', 'medic', 'volt', 'frostbite', 'inferno', 'quake', 'nova'][
        i
      ] as TankId;
      f.x = 100 + i * 160;
    });
    for (const f of g.state.fighters)
      g.action(f.id, { type: 'lock', ...plan(f.x), round: 1 }, 1100);
    expect(g.state.superEvents).toHaveLength(8);
    expect(g.state.fighters.every((f) => f.superpowerUsed)).toBe(true);
    g.tick(g.state.resolveAt + 1);
    expect(g.state.fighters.every((f) => Number.isFinite(f.hp) && Number.isFinite(f.x))).toBe(true);
  });
  it('a reflected projectile applies real authoritative damage to its attacker', () => {
    const g = game();
    const [a, b] = g.state.fighters;
    b.y = a.y - Math.tan((5 * Math.PI) / 180) * (b.x - a.x);
    g.state.environment!.gravityZones = [{ from: 0, to: 1440, multiplier: 0 }];
    g.action(
      '0',
      { type: 'lock', round: 1, angle: 5, power: 60, weapon: 'standard', ability: false },
      1100,
    );
    g.action(
      '1',
      {
        type: 'lock',
        round: 1,
        angle: 175,
        power: 10,
        weapon: 'standard',
        ability: false,
        superpower: true,
      },
      1100,
    );
    const shot = g.state.shots.find((s) => s.owner === '0')!;
    expect(shot.reflections).toHaveLength(1);
    expect(shot.damage.some((d) => d.id === '0' && d.amount > 0)).toBe(true);
    g.tick(g.state.resolveAt + 1);
    expect(g.state.fighters[0].hp).toBeLessThan(a.maxHp);
  });
  it('reflects a shell into its attacker and prevents infinite loops; beams pass', () => {
    const g = game();
    const [a, b] = g.state.fighters;
    a.x = 200;
    b.x = 500;
    a.y = b.y = 200;
    const shields = new Map([
      ['1', { remaining: 1, facing: -1, directional: true }],
      ['0', { remaining: 2, facing: 1, directional: false }],
    ]);
    const w = { ...WEAPONS.standard, gravity: 0 };
    const f = projectile(a, 0, 100, w, 0, new Terrain(), [a, b], '0', false, undefined, shields);
    expect(f.reflectedBy).toBe('1');
    expect(f.directId).toBe('0');
    expect(f.reflections).toHaveLength(1);
    expect(shields.get('1')!.remaining).toBe(0);
    expect(shields.get('0')!.remaining).toBe(2);
    const beam = projectile(
      a,
      0,
      100,
      { ...w, behavior: 'pierce' },
      0,
      new Terrain(),
      [a, b],
      '0',
      false,
      undefined,
      new Map([['1', { remaining: 1, facing: -1, directional: true }]]),
    );
    expect(beam.directId).toBe('1');
    expect(beam.reflectedBy).toBeUndefined();
  });
});
