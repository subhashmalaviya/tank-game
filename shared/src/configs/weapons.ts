import type { Weapon } from '../types';
const w = (
  id: string,
  name: string,
  damage: number,
  speed: number,
  gravity: number,
  radius: number,
  terrain: number,
  color: string,
  extra: Partial<Weapon> = {},
): Weapon => ({
  id,
  name,
  damage,
  speed,
  gravity,
  radius,
  terrain,
  color,
  direct: 10,
  projectiles: 1,
  cooldown: 0,
  ammo: -1,
  ...extra,
});
export const WEAPONS: Record<string, Weapon> = {
  standard: w('standard', 'Standard shell', 31, 820, 1, 48, 40, '#f8d58c'),
  heavy: w('heavy', 'Siege Cannon', 42, 760, 1.12, 67, 58, '#edc675', {
    cooldown: 1,
    chargeMs: 420,
  }),
  shadow: w('shadow', 'Shadow Lance', 34, 1080, 0.45, 25, 18, '#b898ff', {
    chargeMs: 120,
    direct: 20,
  }),
  cluster: w('cluster', 'Swarm Missiles', 18, 800, 1, 37, 32, '#b7dd76', {
    projectiles: 3,
    direct: 5,
  }),
  piercing: w('piercing', 'Rail Piercer', 35, 960, 0.7, 34, 52, '#8dafff', {
    behavior: 'pierce',
    direct: 18,
  }),
  bouncing: w('bouncing', 'Ricochet', 36, 780, 1, 53, 42, '#edd69c', {
    behavior: 'bounce',
    ammo: 3,
    cooldown: 1,
  }),
  guided: w('guided', 'Seeker missile', 32, 740, 0.7, 47, 38, '#d4afff', {
    behavior: 'guided',
    ammo: 2,
    cooldown: 2,
  }),
  electric: w('electric', 'Arc Discharger', 28, 860, 0.82, 48, 30, '#71d8f5', {
    behavior: 'chain',
    status: 'emp',
  }),
  incendiary: w('incendiary', 'Magma Mortar', 27, 800, 1, 58, 38, '#ff8662', {
    status: 'burn',
  }),
  ice: w('ice', 'Cryo Shard', 29, 850, 0.9, 50, 35, '#9fe5e8', { status: 'freeze' }),
  seismic: w('seismic', 'Tectonic Shell', 34, 660, 1.15, 78, 90, '#d8ac87'),
  plasma: w('plasma', 'Pulse Repeater', 12, 990, 0.65, 24, 17, '#78dcb2', {
    projectiles: 3,
    launchGapMs: 150,
    direct: 4,
  }),
  charged: w('charged', 'Singularity Orb', 39, 720, 0.75, 72, 54, '#f3a0dc', { chargeMs: 650 }),
};
