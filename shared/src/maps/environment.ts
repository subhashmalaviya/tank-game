import type { Environment, Fighter, Hazard, Weapon } from '../types';
import { random, Terrain, WIDTH } from './terrain';
export const ENVIRONMENT_RULES: Record<string, string> = {
  desert:
    'Seeded wind accelerates every projectile. Sand takes 20% larger craters; stone ruins block shots.',
  frozen: 'Ice adds 4m of drift to movement. Heavy and seismic impacts shatter ice cover.',
  volcanic:
    'Lava deals 14 damage at round end within its marked radius. Heat zones pulse every third round.',
  jungle:
    'Stone temples and wooden cover block shots. Incendiary hits ignite wooden cover for three rounds.',
  alien: 'The central field applies 0.55× gravity; outer crystal fields apply 1.25× gravity.',
  industrial:
    'Metal cover resists ordinary explosives. Piercing, seismic and electric weapons bypass resistance; barrels detonate.',
  canyon:
    'Steep ridges create firing positions. Seismic impacts cause a rockfall: 12 damage within 110m of impact.',
  islands:
    'Separated platforms have no ground below. Falling into a gap eliminates the tank after resolution.',
  toxic: 'Marked toxic pools deal 9 damage at round end. Active pools shift on a four-round cycle.',
  neon: 'Energy barriers alternate active/inactive each round. Active barriers block shots; electricity overloads them.',
};
export function generateEnvironment(
  seed: number,
  map: string,
  terrain: Terrain,
  fighters: { x: number }[],
): Environment {
  const rng = random(seed ^ 0x423bc),
    cover: Environment['cover'] = [];
  const material: Record<string, Environment['cover'][number]['material']> = {
    desert: 'stone',
    frozen: 'ice',
    volcanic: 'stone',
    jungle: 'wood',
    alien: 'stone',
    industrial: 'metal',
    canyon: 'stone',
    islands: 'stone',
    toxic: 'wood',
    neon: 'barrier',
  };
  for (let i = 0; i < 50 && cover.length < 6; i++) {
    const x = 70 + rng() * (WIDTH - 140);
    if (fighters.some((p) => Math.abs(p.x - x) < 65) || cover.some((c) => Math.abs(c.x - x) < 65))
      continue;
    const base = terrain.surface(x);
    if (base > 690) continue;
    const h = 26 + rng() * 40,
      m =
        map === 'industrial' && i % 2
          ? 'barrel'
          : map === 'jungle' && i % 2
            ? 'stone'
            : material[map];
    const hp = m === 'metal' ? 90 : m === 'barrier' ? 70 : m === 'stone' ? 65 : 35;
    cover.push({
      id: `cover-${i}`,
      x,
      y: base - h,
      width: m === 'barrel' ? 24 : 30 + rng() * 25,
      height: h,
      hp,
      maxHp: hp,
      material: m,
      active: true,
    });
  }
  return {
    wind: map === 'desert' ? Math.round((rng() - 0.5) * 70) : 0,
    gravityZones:
      map === 'alien'
        ? [
            { from: 500, to: 940, multiplier: 0.55 },
            { from: 0, to: 250, multiplier: 1.25 },
          ]
        : [],
    cover,
    rules: ENVIRONMENT_RULES[map],
  };
}
export function coverAt(env: Environment | undefined, x: number, y: number) {
  return env?.cover.find(
    (c) =>
      c.hp > 0 && c.active && Math.abs(x - c.x) < c.width / 2 && y >= c.y && y < c.y + c.height,
  );
}
export function coverDamage(material: string, weapon: Weapon) {
  const bypass = ['piercing', 'seismic', 'electric'].includes(weapon.id);
  return (
    weapon.damage *
    (material === 'metal' && !bypass
      ? 0.4
      : material === 'ice' && ['heavy', 'seismic'].includes(weapon.id)
        ? 4
        : material === 'barrier' && weapon.id === 'electric'
          ? 4
          : 1.5)
  );
}
export function environmentRound(env: Environment, map: string, round: number, hazards: Hazard[]) {
  for (const c of env.cover) if (c.material === 'barrier') c.active = round % 2 === 1;
  for (const h of hazards) {
    if (map === 'volcanic' && h.kind === 'lava') h.radius = round % 3 === 0 ? 55 : 38;
    if (map === 'toxic' && h.kind === 'toxic') h.radius = round % 4 === 0 ? 24 : 42;
  }
}
