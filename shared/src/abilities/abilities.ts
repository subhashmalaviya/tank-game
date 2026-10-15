import type { Fighter, Hazard } from '../types';
import { TANKS } from '../configs/tanks';
export interface AbilityContext {
  actor: Fighter;
  fighters: Fighter[];
  teamMode: boolean;
  hazards: Hazard[];
  targetId?: string;
  damage: (target: Fighter, amount: number) => void;
  crater: (x: number, y: number, r: number) => void;
}
export interface Ability {
  apply: (ctx: AbilityContext) => string;
}
export const ABILITIES: Record<string, Ability> = {
  titan: {
    apply: ({ actor }) => {
      actor.statuses.fortify = 2;
      return 'Armor fortified';
    },
  },
  phantom: {
    apply: ({ actor }) => {
      actor.statuses.cloak = 2;
      return 'Cloaking field engaged';
    },
  },
  volt: {
    apply: ({ actor, fighters, teamMode }) => {
      for (const t of fighters)
        if (enemy(actor, t, teamMode) && Math.abs(t.x - actor.x) < 320) t.statuses.emp = 2;
      return 'EMP wave discharged';
    },
  },
  inferno: {
    apply: ({ actor, fighters, teamMode, hazards }) => {
      const t = nearest(actor, fighters, teamMode, 420);
      hazards.push({
        x: t?.x ?? actor.x + 80,
        y: t?.y ?? actor.y,
        radius: 100,
        kind: 'fire',
        turns: 3,
        owner: actor.id,
      });
      return 'Burning ground deployed';
    },
  },
  frostbite: {
    apply: ({ actor, fighters, teamMode }) => {
      for (const t of fighters)
        if (enemy(actor, t, teamMode) && Math.abs(t.x - actor.x) < 340) t.statuses.freeze = 2;
      return 'Cryo wave released';
    },
  },
  viper: {
    apply: ({ actor }) => {
      actor.statuses.overcharge = 3;
      return 'Five-missile barrage armed';
    },
  },
  bastion: {
    apply: ({ actor, fighters, teamMode }) => {
      for (const t of fighters)
        if (
          t.hp > 0 &&
          (t.id === actor.id || (teamMode && t.team === actor.team)) &&
          Math.abs(t.x - actor.x) < 220
        )
          t.statuses.shield = 40;
      return 'Energy shields online';
    },
  },
  quake: {
    apply: ({ actor, fighters, teamMode, crater, damage }) => {
      const t = nearest(actor, fighters, teamMode, 420);
      if (!t) throw new Error('No enemy within 420m. Move closer first.');
      crater(t.x, t.y + 22, 100);
      damage(t, 18);
      return 'Earthshaker rupture';
    },
  },
  medic: {
    apply: ({ actor, fighters, teamMode, targetId }) => {
      const t = targetId ? fighters.find((p) => p.id === targetId) : actor;
      if (
        !t ||
        t.hp <= 0 ||
        (t.id !== actor.id && (!teamMode || t.team !== actor.team)) ||
        Math.abs(t.x - actor.x) > 420
      )
        throw new Error('Choose a living ally within 420m.');
      if (t.hp === t.maxHp) throw new Error('Target already has full health.');
      t.hp = Math.min(t.maxHp, t.hp + 36);
      return `Repair pulse: ${t.name}`;
    },
  },
  nova: {
    apply: ({ actor }) => {
      actor.statuses.overcharge = 3;
      return 'Plasma core overcharged';
    },
  },
};
export function enemy(a: Fighter, b: Fighter, teamMode: boolean) {
  return b.hp > 0 && a.id !== b.id && (!teamMode || a.team !== b.team);
}
function nearest(a: Fighter, fs: Fighter[], teams: boolean, range: number) {
  return fs
    .filter((t) => enemy(a, t, teams) && Math.abs(t.x - a.x) < range)
    .sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
}
export function activateAbility(ctx: AbilityContext) {
  const def = TANKS[ctx.actor.tank];
  if (ctx.actor.statuses.emp) throw new Error('Abilities disabled by EMP.');
  if (ctx.actor.cooldown > 0) throw new Error('Ability is cooling down.');
  if (ctx.actor.energy < def.ability.cost) throw new Error('Not enough energy.');
  const message = ABILITIES[ctx.actor.tank].apply(ctx);
  ctx.actor.energy -= def.ability.cost;
  ctx.actor.cooldown = def.ability.cooldown + 1;
  return message;
}
