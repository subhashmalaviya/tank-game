import { describe, it, expect } from 'vitest';
import { RoundGame } from '../server/src/game/rounds';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import { MAPS } from '../shared/src/configs/maps';
import { TANKS, TANK_IDS } from '../shared/src/configs/tanks';
import { WEAPONS } from '../shared/src/configs/weapons';
import { generateMap, Terrain } from '../shared/src/maps/terrain';
import {
  generateEnvironment,
  coverAt,
  coverDamage,
  environmentRound,
} from '../shared/src/maps/environment';
import { projectile } from '../shared/src/physics/projectile';
import type { LobbyPlayer, TankId } from '../shared/src/types';
const player = (id: string, tank: TankId, team = 0): LobbyPlayer => ({
  id,
  name: id,
  tank,
  team,
  ready: true,
  bot: false,
  connected: true,
});
const make = (tank: TankId = 'titan', map = 'desert') =>
  new RoundGame(
    [player('a', tank), player('b', 'titan', 1)],
    { ...DEFAULT_CONFIG, map, maxPlayers: 2 },
    42,
    1000,
  );
describe('Ten simultaneous tank kits', () => {
  for (const tank of TANK_IDS)
    it(tank + ' activates only at reveal with cost, effect and cooldown', () => {
      const g = make(tank);
      const [a, b] = g.state.fighters;
      b.x = a.x + 100;
      b.y = a.y;
      a.hp -= 45;
      g.state.environment!.cover = [];
      g.action(
        'a',
        {
          type: 'lock',
          round: 1,
          angle: 90,
          power: 100,
          weapon: TANKS[tank].weapon,
          ability: true,
        },
        1100,
      );
      expect(g.snapshot('b').fighters[0].energy).toBe(100);
      expect(g.snapshot('b').fighters[0].cooldown).toBe(0);
      expect(g.state.abilityEvents).toEqual([]);
      g.action('b', { type: 'pass' }, 1100);
      expect(g.state.abilityEvents?.[0].tank).toBe(tank);
      g.tick(g.state.resolveAt + 1);
      const actor = g.state.fighters[0],
        target = g.state.fighters[1];
      expect(actor.cooldown).toBe(3);
      expect(actor.energy).toBe(Math.min(100, 100 - TANKS[tank].ability.cost + 18));
      if (tank === 'titan') expect(actor.statuses.fortify).toBe(1);
      if (tank === 'phantom') expect(actor.statuses.phase).toBe(1);
      if (tank === 'volt') expect(target.statuses.emp).toBe(1);
      if (tank === 'frostbite') expect(target.statuses.freeze).toBe(1);
      if (tank === 'inferno') expect(g.state.hazards.some((h) => h.kind === 'fire')).toBe(true);
      if (tank === 'bastion') expect(actor.statuses.shield).toBe(40);
      if (tank === 'medic') expect(actor.hp).toBe(actor.maxHp - 9);
      if (tank === 'quake') expect(target.hp).toBeLessThan(target.maxHp);
    });
  it('does not cancel another sealed ability with same-round EMP', () => {
    const g = make('volt');
    const b = g.state.fighters[1];
    b.x = g.state.fighters[0].x + 100;
    g.action(
      'b',
      { type: 'lock', round: 1, angle: 90, power: 100, weapon: 'heavy', ability: true },
      1100,
    );
    g.action(
      'a',
      { type: 'lock', round: 1, angle: 90, power: 100, weapon: 'electric', ability: true },
      1101,
    );
    expect(g.state.abilityEvents).toHaveLength(2);
  });
  it('safely fizzles an out-of-range repair after the ally moves away', () => {
    const g = new RoundGame(
      [
        player('a', 'medic'),
        player('b', 'phantom'),
        player('c', 'titan', 1),
        player('d', 'titan', 1),
      ],
      { ...DEFAULT_CONFIG, mode: 'teams', teams: 2, teamSize: 2, maxPlayers: 4, map: 'desert' },
      42,
      1000,
    );
    const a = g.state.fighters.find((f) => f.id === 'a')!,
      b = g.state.fighters.find((f) => f.id === 'b')!;
    b.x = a.x + 400;
    b.hp -= 40;
    g.action(
      'a',
      {
        type: 'lock',
        round: 1,
        angle: 90,
        power: 100,
        weapon: 'plasma',
        ability: true,
        targetId: 'b',
      },
      1100,
    );
    b.x = a.x + 500;
    for (const id of ['b', 'c', 'd']) g.action(id, { type: 'pass' }, 1101);
    expect(g.state.phase).toBe('resolving');
    expect(g.state.abilityEvents?.[0].label).toContain('fizzled');
    g.tick(g.state.resolveAt + 1);
    expect(g.state.fighters.find((f) => f.id === 'a')!.energy).toBe(100);
  });
  it('keeps forfeits and connection changes when a resolution commits', () => {
    const g = make();
    g.action('a', { type: 'pass' }, 1100);
    g.action('b', { type: 'pass' }, 1100);
    g.forfeit('b');
    g.state.fighters[1].connected = false;
    expect(g.tick(g.state.resolveAt + 1)).toBe(true);
    expect(g.state.result?.winnerIds).toEqual(['a']);
    expect(g.state.fighters[1].connected).toBe(false);
  });
  it.each([2, 3, 4, 6, 8])('resolves all %i living pilots in one FFA round', (n) => {
    const ps = Array.from({ length: n }, (_, i) => player(String(i), TANK_IDS[i]));
    const g = new RoundGame(ps, { ...DEFAULT_CONFIG, maxPlayers: n, map: 'desert' }, 44, 1000);
    for (const p of ps)
      g.action(
        p.id,
        { type: 'lock', round: 1, angle: 90, power: 100, weapon: 'standard', ability: false },
        1100,
      );
    expect(new Set(g.state.shots.map((s) => s.owner)).size).toBe(n);
    expect(g.tick(g.state.resolveAt + 1)).toBe(true);
  });
  it.each([2, 3, 4])('supports %iv%i team simultaneous wins', (size) => {
    const ps = Array.from({ length: size * 2 }, (_, i) =>
      player(String(i), 'titan', i < size ? 0 : 1),
    );
    const g = new RoundGame(
      ps,
      {
        ...DEFAULT_CONFIG,
        mode: 'teams',
        teams: 2,
        teamSize: size,
        maxPlayers: size * 2,
        map: 'desert',
      },
      44,
      1000,
    );
    for (const p of ps) g.action(p.id, { type: 'pass' }, 1100);
    for (const p of ps.filter((p) => p.team === 1)) g.forfeit(p.id);
    g.tick(g.state.resolveAt + 1);
    expect(g.state.result?.winnerIds.sort()).toEqual(
      ps
        .filter((p) => p.team === 0)
        .map((p) => p.id)
        .sort(),
    );
  });
});
describe('Distinct authoritative map mechanics', () => {
  for (const m of MAPS)
    it(m.name + ' has reproducible safe cover in every lobby size', () => {
      for (let n = 2; n <= 8; n++)
        for (let seed = 1; seed <= 5; seed++) {
          const map = generateMap(seed, m.id, n),
            env = generateEnvironment(seed, m.id, map.terrain, map.spawns);
          expect(env).toEqual(generateEnvironment(seed, m.id, map.terrain, map.spawns));
          expect(env.cover.length).toBeGreaterThan(0);
          for (const f of map.spawns) {
            expect(coverAt(env, f.x, f.y)).toBeUndefined();
            expect(map.hazards.every((h) => Math.hypot(h.x - f.x, h.y - f.y) > h.radius + 12)).toBe(
              true,
            );
          }
          if (m.hazard) expect(map.hazards.length).toBeGreaterThan(0);
        }
    });
  it('generates different terrain structures, beyond palette changes', () => {
    const signatures = MAPS.map((m) => generateMap(42, m.id, 4).terrain.pack().join(','));
    expect(new Set(signatures).size).toBe(10);
  });
  it('collides with active cover and passes an inactive barrier', () => {
    const t = new Terrain(),
      env = generateEnvironment(42, 'neon', generateMap(42, 'neon', 2).terrain, []);
    env.cover = [
      {
        id: 'wall',
        x: 240,
        y: 0,
        width: 20,
        height: 700,
        hp: 100,
        maxHp: 100,
        material: 'barrier',
        active: true,
      },
    ];
    const shot = () =>
      projectile({ x: 100, y: 100 }, 5, 100, WEAPONS.shadow, 245, t, [], 'a', false, env);
    expect(shot().coverId).toBe('wall');
    environmentRound(env, 'neon', 2, []);
    expect(shot().coverId).toBeUndefined();
  });
  it('metal resists shells, heavy cracks ice, and electricity overloads barriers', () => {
    expect(coverDamage('metal', WEAPONS.heavy)).toBeLessThan(WEAPONS.heavy.damage);
    expect(coverDamage('metal', WEAPONS.piercing)).toBeGreaterThan(WEAPONS.piercing.damage);
    expect(coverDamage('ice', WEAPONS.heavy)).toBe(WEAPONS.heavy.damage * 4);
    expect(coverDamage('barrier', WEAPONS.electric)).toBe(WEAPONS.electric.damage * 4);
  });
  it('lava and poison damage only tanks within the public boundary at round end', () => {
    for (const map of ['volcanic', 'toxic']) {
      const g = make('titan', map),
        [a, b] = g.state.fighters;
      g.state.hazards = [
        { x: a.x, y: a.y, radius: 30, kind: map === 'volcanic' ? 'lava' : 'toxic', turns: 999 },
      ];
      g.action('a', { type: 'pass' }, 1100);
      g.action('b', { type: 'pass' }, 1100);
      expect(g.state.fighters[0].hp).toBe(a.maxHp);
      g.tick(g.state.resolveAt + 1);
      expect(g.state.fighters[0].hp).toBeLessThan(a.maxHp);
      expect(g.state.fighters[1].hp).toBe(b.maxHp);
    }
  });
  it('gravity fields change the full projectile flight', () => {
    const g = make('titan', 'alien'),
      env = g.state.environment!;
    env.cover = [];
    const shot = (zones: typeof env.gravityZones) =>
      projectile({ x: 600, y: 100 }, 60, 40, WEAPONS.standard, 165, new Terrain(), [], 'a', false, {
        ...env,
        gravityZones: zones,
      });
    expect(shot(env.gravityZones).durationMs).not.toBe(shot([]).durationMs);
  });
});
