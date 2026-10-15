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
  heavy: w('heavy', 'Heavy shell', 42, 760, 1.12, 67, 58, '#edc675'),
  cluster: w('cluster', 'Cluster missiles', 18, 800, 1, 37, 32, '#b7dd76', {
    projectiles: 3,
    direct: 5,
  }),
  piercing: w('piercing', 'Piercing cannon', 35, 960, 0.7, 34, 52, '#8dafff', {
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
  electric: w('electric', 'Arc bolt', 28, 860, 0.82, 48, 30, '#71d8f5', {
    behavior: 'chain',
    status: 'emp',
  }),
  incendiary: w('incendiary', 'Incendiary shell', 27, 800, 1, 58, 38, '#ff8662', {
    status: 'burn',
  }),
  ice: w('ice', 'Cryo shell', 29, 850, 0.9, 50, 35, '#9fe5e8', { status: 'freeze' }),
  seismic: w('seismic', 'Seismic shell', 34, 660, 1.15, 78, 90, '#d8ac87'),
  plasma: w('plasma', 'Plasma pulse', 30, 850, 0.85, 48, 38, '#78dcb2'),
  charged: w('charged', 'Charged plasma', 39, 920, 0.75, 52, 44, '#f3a0dc'),
};
