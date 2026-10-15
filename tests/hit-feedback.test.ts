import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game/engine';
import { RoundGame } from '../server/src/game/rounds';
import { DEFAULT_CONFIG } from '../shared/src/configs/match';
import { Terrain, COLS } from '../shared/src/maps/terrain';
import { projectile } from '../shared/src/physics/projectile';
import { fightersAtImpact } from '../client/src/effects/combatFeedback';
import { tankContains, TANK_PROFILES } from '../shared/src/physics/tankGeometry';
import { TANK_IDS } from '../shared/src/configs/tanks';
import { WEAPONS } from '../shared/src/configs/weapons';
import type { LobbyPlayer } from '../shared/src/types';
const pilots: LobbyPlayer[] = [
  {
    id: 'human',
    name: 'Human',
    tank: 'phantom',
    team: 0,
    ready: true,
    connected: true,
    bot: false,
  },
  { id: 'bot', name: 'Bot', tank: 'titan', team: 1, ready: true, connected: true, bot: true },
];
function setup(simultaneous = false) {
  const g = new (simultaneous ? RoundGame : Game)(
    pilots,
    { ...DEFAULT_CONFIG, maxPlayers: 2, map: 'desert' },
    42,
    1000,
  );
  g.terrain = new Terrain();
  g.terrain.data.fill(1, 53 * COLS);
  const [a, b] = g.state.fighters;
  a.x = 100;
  a.y = 190;
  b.x = 300;
  b.y = 200;
  g.state.terrain = g.terrain.pack();
  if (g.state.environment) {
    g.state.environment.cover = [];
    g.state.environment.wind = 0;
  }
  return g;
}
describe('Visible hits against bots', () => {
  it('registers a projectile through the drawn turret above the old hitbox', () => {
    const g = setup(),
      [a, b] = g.state.fighters;
    const flight = projectile(
      a,
      5,
      100,
      { ...WEAPONS.shadow, gravity: 0 },
      245,
      new Terrain(),
      [a, b],
      a.id,
    );
    expect(flight.directId).toBe(b.id);
  });
  it.each([false, true])('a turret hit reduces bot HP in simultaneous=%s', (simultaneous) => {
    const g = setup(simultaneous);
    if (simultaneous) {
      g.action(
        'human',
        { type: 'lock', round: 1, weapon: 'shadow', angle: 5, power: 100, ability: false },
        1100,
      );
      g.action('bot', { type: 'pass' }, 1100);
    } else g.action('human', { type: 'fire', weapon: 'shadow', angle: 5, power: 100 }, 1100);
    expect(g.state.shots.flatMap((s) => s.damage).some((d) => d.id === 'bot' && d.amount > 0)).toBe(
      true,
    );
    g.tick(g.state.resolveAt + 1);
    expect(g.state.fighters[1].hp).toBeLessThan(g.state.fighters[1].maxHp);
  });
  it.each(TANK_IDS)('%s hull, turret and tracks match the visible scaled body', (tank) => {
    const f = { x: 300, y: 200, tank },
      [sx, sy] = TANK_PROFILES[tank];
    for (const [x, y] of [
      [0, -22],
      [-27, 0],
      [-28, 11],
      [28, 11],
    ])
      expect(tankContains(f, f.x + x * sx, f.y + y * sy)).toBe(true);
    expect(tankContains(f, f.x - 32 * sx, f.y - 27 * sy)).toBe(false);
    expect(tankContains(f, f.x, f.y - 45 * sy)).toBe(false);
  });
  it('updates HP at the confirmed impact, before round commit, without mutating network state', () => {
    const g = setup(true);
    g.action(
      'human',
      { type: 'lock', round: 1, weapon: 'shadow', angle: 5, power: 100, ability: false },
      1100,
    );
    g.action('bot', { type: 'pass' }, 1100);
    const s = g.state,
      shot = s.shots[0],
      damage = shot.damage.find((d) => d.id === 'bot')!;
    expect(damage.amount).toBeGreaterThan(0);
    const before = JSON.stringify(s);
    expect(fightersAtImpact(s, shot.impactMs! - 1)[1].hp).toBe(s.fighters[1].hp);
    expect(fightersAtImpact(s, shot.impactMs!)[1].hp).toBe(s.fighters[1].hp - damage.amount);
    expect(JSON.stringify(s)).toBe(before);
    g.tick(g.state.resolveAt + 1);
    expect(g.state.resolutionStart).toBeUndefined();
    expect(fightersAtImpact(g.state, 99999)).toBe(g.state.fighters);
  });
  it('reports shield absorption instead of silently showing an unchanged health bar', () => {
    const g = setup(true),
      b = g.state.fighters[1];
    b.tank = 'bastion';
    g.action(
      'human',
      { type: 'lock', round: 1, weapon: 'shadow', angle: 5, power: 100, ability: false },
      1100,
    );
    g.action(
      'bot',
      { type: 'lock', round: 1, weapon: 'standard', angle: 5, power: 100, ability: true },
      1100,
    );
    const shot = g.state.shots.find((s) => s.owner === 'human')!,
      hit = shot.damage.find((d) => d.id === 'bot')!;
    expect(hit.absorbed).toBeGreaterThan(0);
    expect(hit.amount).toBe(0);
    const before = fightersAtImpact(g.state, shot.impactMs! - 1)[1],
      after = fightersAtImpact(g.state, shot.impactMs!)[1];
    expect(before.statuses.shield).toBe(40);
    expect(after.statuses.shield).toBe(40 - hit.absorbed!);
    expect(after.hp).toBe(before.hp);
  });
  it('classic shields publish their absorbed damage as well', () => {
    const g = setup();
    g.state.fighters[1].statuses.shield = 40;
    g.action('human', { type: 'fire', weapon: 'shadow', angle: 5, power: 100 }, 1100);
    const hit = g.state.shots[0].damage.find((d) => d.id === 'bot')!;
    expect(hit.absorbed).toBeGreaterThan(0);
    expect(hit.amount).toBe(0);
  });
  it('classic mode also shows HP loss when the projectile lands, not before launch', () => {
    const g = setup();
    g.action('human', { type: 'fire', weapon: 'shadow', angle: 5, power: 100 }, 1100);
    const shot = g.state.shots[0];
    expect(fightersAtImpact(g.state, 0)[1].hp).toBe(g.state.fighters[1].maxHp);
    expect(fightersAtImpact(g.state, shot.impactMs!)[1].hp).toBe(g.state.fighters[1].hp);
  });
});
