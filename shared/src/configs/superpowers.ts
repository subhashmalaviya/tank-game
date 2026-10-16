import type { TankId } from '../types';
export interface SuperpowerDefinition {
  name: string;
  icon: string;
  range: number;
  radius: number;
  damage: number;
  terrain: number;
  duration: number;
  count: number;
  shield: number;
  heal: number;
  description: string;
}
const power = (
  name: string,
  icon: string,
  description: string,
  values: Partial<SuperpowerDefinition>,
): SuperpowerDefinition => ({
  name,
  icon,
  description,
  range: 600,
  radius: 120,
  damage: 50,
  terrain: 0,
  duration: 1,
  count: 1,
  shield: 0,
  heal: 0,
  ...values,
});
export const SUPERPOWERS: Record<TankId, SuperpowerDefinition> = {
  titan: power(
    'Reflective Aegis',
    '◈',
    'Reflect one frontal shell during this volley. Beams and area damage cannot reflect.',
    { count: 1 },
  ),
  phantom: power(
    'Shadow Jump Strike',
    '↟',
    'Jump to the marked ground within 420m; landing damages enemies and excavates terrain.',
    { range: 420, radius: 110, terrain: 50, damage: 48 },
  ),
  volt: power(
    'Chain Lightning Storm',
    'ϟ',
    'Strike up to four enemies, chaining within 280m with 25% damage falloff.',
    { count: 4, range: 560, radius: 280, damage: 60 },
  ),
  inferno: power(
    'Meteor Cataclysm',
    '☄',
    'Drop a meteor within 650m. Cover intercepts it; blast leaves fire for three rounds.',
    { range: 650, radius: 145, damage: 75, terrain: 95, duration: 3 },
  ),
  frostbite: power(
    'Absolute Freeze',
    '❄',
    'Enemies within 460m have 70% less movement for the next two planning rounds; firing remains available.',
    { range: 460, duration: 3, damage: 12 },
  ),
  viper: power(
    'Hunter’s Barrage',
    '⋮',
    'Five guided missiles acquire the nearest enemy within 600m of the marked area. Terrain and cover block them.',
    { count: 5, range: 600, radius: 40, damage: 18, terrain: 22 },
  ),
  bastion: power(
    'Fortress Reflection',
    '⬡',
    'Self-only dome: reflect two shells from any direction and absorb 65 damage this volley.',
    { count: 2, shield: 65 },
  ),
  quake: power(
    'Earthshatter',
    '⌁',
    'Rupture ground toward the mark for up to 600m; gaps stop propagation.',
    { range: 600, radius: 80, damage: 55, terrain: 35 },
  ),
  medic: power(
    'Emergency Overdrive',
    '✚',
    'Repair self up to 65 HP and nearby allies up to 30 HP; grant a one-volley protective shield. No revival.',
    { heal: 65, shield: 35, radius: 230 },
  ),
  nova: power(
    'Singularity Collapse',
    '◉',
    'Pull enemies at most 65m along valid ground toward the mark, then detonate. Walls block pulling.',
    { range: 600, radius: 180, damage: 65, terrain: 60 },
  ),
};
