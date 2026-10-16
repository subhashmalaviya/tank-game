import { SUPERPOWERS } from '../../../shared/src/configs/superpowers';
import { WEAPONS } from '../../../shared/src/configs/weapons';
import { mapById } from '../../../shared/src/configs/maps';
import { Terrain, HEIGHT } from '../../../shared/src/maps/terrain';
import { coverAt } from '../../../shared/src/maps/environment';
import { projectile, type ReflectionShield } from '../../../shared/src/physics/projectile';
import type { Fighter, MatchState, Plan, Point, Shot } from '../../../shared/src/types';
export interface SuperDamage {
  target: string;
  source?: string;
  raw: number;
  shot?: Shot;
}
export function validateSuper(a: Fighter, p: Plan, s: MatchState, terrain: Terrain) {
  if (!p.superpower) return;
  if (p.pass) throw new Error('A passing plan cannot use a superpower.');
  if (a.superpowerUsed) throw new Error('Superpower already used this match.');
  if (a.statuses.emp) throw new Error('Superpower disabled by EMP.');
  const d = SUPERPOWERS[a.tank];
  if (p.superTargetX !== undefined && Math.abs(p.superTargetX - a.x) > d.range)
    throw new Error('Superpower target is out of range.');
  if (a.tank === 'phantom') {
    const x = p.superTargetX ?? a.x,
      y = terrain.surface(x) - 12;
    if (
      y >= HEIGHT - 25 ||
      terrain.solid(x, y) ||
      coverAt(s.environment, x, y) ||
      [-24, 24].some((dx) => terrain.solid(x + dx, y - 8))
    )
      throw new Error('Jump needs clear, supported ground.');
    for (let i = 1; i < 100; i++) {
      const t = i / 100,
        px = a.x + (x - a.x) * t,
        py = a.y + (y - a.y) * t - Math.sin(t * Math.PI) * 180;
      if (terrain.solid(px, py - 8) || coverAt(s.environment, px, py - 8))
        throw new Error('Jump path is blocked.');
    }
    if (s.fighters.some((f) => f.id !== a.id && f.hp > 0 && Math.abs(f.x - x) < 55))
      throw new Error('Landing point overlaps another tank.');
  }
}
export function resolveSupers(
  s: MatchState,
  terrain: Terrain,
  plans: Map<string, Plan>,
  damage: SuperDamage[],
) {
  const shields = new Map<string, ReflectionShield>();
  for (const f of s.fighters) {
    const p = plans.get(f.id),
      d = SUPERPOWERS[f.tank];
    if (f.hp > 0 && p?.superpower && !p.pass && ['titan', 'bastion'].includes(f.tank))
      shields.set(f.id, {
        remaining: d.count,
        facing: Math.cos((p.angle * Math.PI) / 180) >= 0 ? 1 : -1,
        directional: f.tank === 'titan',
      });
  }
  const original = structuredClone(s.fighters);
  const board = new Terrain(terrain.data.slice());
  s.superEvents = [];
  const eligible = (a: Fighter, t: Fighter) =>
    t.hp > 0 &&
    a.id !== t.id &&
    (s.config.mode !== 'teams' || s.config.friendlyFire || a.team !== t.team);
  const live = (id: string) => s.fighters.find((f) => f.id === id)!;
  const safeMove = (f: Fighter, x: number) => {
    const dir = Math.sign(x - f.x);
    const distance = Math.abs(x - f.x);
    for (let step = 0; step < distance; step += 2) {
      const nx = f.x + dir * 2,
        ny = board.surface(nx) - 12;
      if (
        nx < 30 ||
        nx > 1410 ||
        ny >= HEIGHT - 25 ||
        Math.abs(ny - f.y) > 8 ||
        coverAt(s.environment, nx + dir * 24, ny) ||
        board.solid(nx + dir * 24, ny - 8)
      )
        break;
      f.x = nx;
      f.y = ny;
      if (Math.abs(f.x - x) < 2) break;
    }
  };
  for (const a of [...original].sort((a, b) => a.id.localeCompare(b.id))) {
    const plan = plans.get(a.id);
    if (!plan?.superpower || plan.pass || a.hp <= 0) continue;
    const actor = live(a.id),
      d = SUPERPOWERS[a.tank];
    actor.superpowerUsed = true;
    const x = plan.superTargetX ?? a.x,
      point = { x, y: board.surface(x) - 12 };
    const event = {
      cancelled: false,
      facing: Math.cos((plan.angle * Math.PI) / 180) >= 0 ? 1 : -1,
      owner: a.id,
      tank: a.tank,
      from: { x: a.x, y: a.y },
      to: point,
      path: [] as Point[],
      targets: [] as (Point & { id?: string })[],
      durationMs: 1400,
    };
    s.superEvents.push(event);
    const effect = (
      position: Point,
      radius: number,
      raw: number,
      weapon: string,
      terrainRadius = 0,
      path: Point[] = [position],
      delay = 900,
    ) => {
      const shot: Shot = {
        id: `${s.id}:${s.turn}:${a.id}:super:${s.shots.length}`,
        round: s.turn,
        owner: a.id,
        weapon,
        path,
        impact: position,
        radius,
        terrainRadius,
        color: WEAPONS[weapon].color,
        hit: true,
        launchMs: 0,
        impactMs: delay,
        damage: [],
      };
      s.shots.push(shot);
      for (const t of original)
        if (eligible(a, t)) {
          const resolved = a.tank === 'nova' ? live(t.id) : t;
          const dist = Math.hypot(resolved.x - position.x, resolved.y - position.y);
          if (dist < radius)
            damage.push({
              target: t.id,
              source: a.id,
              raw: raw * (1 - (0.5 * dist) / radius) * s.config.damageMultiplier,
              shot,
            });
        }
      return shot;
    };
    switch (a.tank) {
      case 'titan':
      case 'bastion':
        if (d.shield) {
          actor.statuses.shield = (actor.statuses.shield ?? 0) + d.shield;
          actor.statuses.shieldTurns = 1;
        }
        break;
      case 'phantom': {
        try {
          validateSuper({ ...actor, superpowerUsed: false }, plan, s, board);
        } catch {
          event.cancelled = true;
          event.to = { x: a.x, y: a.y };
          break;
        }

        // Recheck against the frozen board, so another power cannot invalidate an accepted landing.
        actor.x = x;
        actor.y = point.y;
        event.path = Array.from({ length: 29 }, (_, i) => {
          const t = i / 28;
          return {
            x: a.x + (x - a.x) * t,
            y: a.y + (point.y - a.y) * t - Math.sin(t * Math.PI) * 180,
          };
        });
        effect(point, d.radius, d.damage, 'shadow', d.terrain, event.path);
        for (const t of original)
          if (eligible(a, t) && Math.hypot(t.x - x, t.y - point.y) < d.radius)
            safeMove(live(t.id), t.x + Math.sign(t.x - x) * 24);
        break;
      }
      case 'volt': {
        let origin: Point = a;
        const seen = new Set<string>();
        for (let i = 0; i < d.count; i++) {
          const target = original
            .filter(
              (t) =>
                eligible(a, t) &&
                !seen.has(t.id) &&
                Math.hypot(t.x - origin.x, t.y - origin.y) < (i ? d.radius : d.range),
            )
            .sort(
              (u, v) =>
                Math.hypot(u.x - origin.x, u.y - origin.y) -
                  Math.hypot(v.x - origin.x, v.y - origin.y) || u.id.localeCompare(v.id),
            )[0];
          if (!target) break;
          seen.add(target.id);
          event.targets.push({ x: target.x, y: target.y });
          const shot = effect(
            { x: target.x, y: target.y },
            1,
            0,
            'electric',
            0,
            [
              { x: origin.x, y: origin.y },
              { x: target.x, y: target.y },
            ],
            300 + i * 160,
          );
          damage.push({
            target: target.id,
            source: a.id,
            raw: d.damage * 0.75 ** i * s.config.damageMultiplier,
            shot,
          });
          origin = target;
        }
        break;
      }
      case 'inferno': {
        // Descending meteor is intercepted by the first solid terrain or active cover.
        let y = 0;
        while (y < HEIGHT && !board.solid(x, y) && !coverAt(s.environment, x, y)) y += 3;
        const impact = { x, y };
        event.to = impact;
        effect(impact, d.radius, d.damage, 'incendiary', d.terrain, [{ x, y: -100 }, impact]);
        s.hazards.push({
          ...impact,
          kind: 'fire',
          radius: d.radius,
          turns: d.duration,
          owner: a.id,
        });
        for (const c of s.environment?.cover ?? [])
          if (c.hp > 0 && Math.hypot(c.x - x, c.y - y) < d.radius)
            c.hp = Math.max(0, c.hp - (c.material === 'metal' ? 35 : 90));
        break;
      }
      case 'frostbite':
        for (const t of original)
          if (eligible(a, t) && Math.hypot(t.x - a.x, t.y - a.y) < d.range) {
            live(t.id).statuses.freeze = Math.max(live(t.id).statuses.freeze ?? 0, d.duration);
            event.targets.push({ x: t.x, y: t.y });
          }
        effect(a, d.range, d.damage, 'ice');
        break;
      case 'viper': {
        const target = original
          .filter((t) => eligible(a, t) && Math.abs(t.x - x) < d.range)
          .sort((u, v) => Math.abs(u.x - x) - Math.abs(v.x - x) || u.id.localeCompare(v.id))[0];
        for (let i = 0; i < d.count; i++) {
          const w = { ...WEAPONS.guided, damage: d.damage, radius: d.radius, terrain: d.terrain };
          const flight = projectile(
            a,
            (target ? target.x > a.x : x > a.x) ? 55 + i * 3 : 125 - i * 3,
            65,
            w,
            mapById(s.map).gravity,
            board,
            original,
            a.id,
            s.config.mode === 'teams' && !s.config.friendlyFire,
            s.environment,
            shields,
            target?.id,
          );
          const shot = effect(
            flight.impact,
            flight.hit ? d.radius : 0,
            d.damage,
            'guided',
            flight.hit ? d.terrain : 0,
            flight.path,
            flight.durationMs + i * 130 + 200,
          );
          shot.launchMs = i * 130 + 200;
          shot.hit = flight.hit;
          shot.reflections = flight.reflections;
          if (flight.reflectedBy) {
            for (let j = damage.length - 1; j >= 0; j--)
              if (damage[j].shot === shot) damage.splice(j, 1);
            const defender = live(flight.reflectedBy);
            for (const t of original)
              if (
                eligible(defender, t) &&
                Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y) < d.radius
              )
                damage.push({
                  target: t.id,
                  source: defender.id,
                  raw:
                    d.damage *
                    (1 -
                      (0.5 * Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y)) / d.radius) *
                    s.config.damageMultiplier,
                  shot,
                });
          }
        }
        break;
      }
      case 'quake': {
        const direction = Math.sign(x - a.x) || 1;
        for (let distance = 30; distance <= Math.min(d.range, Math.abs(x - a.x)); distance += 24) {
          const px = a.x + direction * distance,
            py = board.surface(px);
          if (py >= HEIGHT) break;
          event.path.push({ x: px, y: py });
          terrain.crater(px, py, d.terrain);
        }
        for (const t of original)
          if (
            eligible(a, t) &&
            event.path.some((p) => Math.hypot(t.x - p.x, t.y - p.y) < d.radius)
          ) {
            const shot = effect({ x: t.x, y: t.y }, 1, 0, 'seismic', 0);
            damage.push({
              target: t.id,
              source: a.id,
              raw: d.damage * s.config.damageMultiplier,
              shot,
            });
            safeMove(live(t.id), t.x + direction * 30);
          }
        break;
      }
      case 'medic':
        for (const t of original)
          if (
            t.hp > 0 &&
            (t.id === a.id || (s.config.mode === 'teams' && t.team === a.team)) &&
            Math.hypot(t.x - a.x, t.y - a.y) < d.radius
          ) {
            const f = live(t.id);
            f.hp = Math.min(f.maxHp, f.hp + (t.id === a.id ? d.heal : 30));
            f.statuses.shield = (f.statuses.shield ?? 0) + d.shield;
            f.statuses.shieldTurns = Math.max(f.statuses.shieldTurns ?? 0, 1);
            event.targets.push({ x: f.x, y: f.y });
          }
        break;
      case 'nova':
        for (const t of original)
          if (eligible(a, t) && Math.hypot(t.x - x, t.y - point.y) < d.radius) {
            safeMove(live(t.id), t.x + Math.sign(x - t.x) * Math.min(65, Math.abs(x - t.x)));
            event.targets.push({ id: t.id, x: live(t.id).x, y: live(t.id).y });
          }
        effect(point, d.radius, d.damage, 'charged', d.terrain);
        break;
    }
  }
  return shields;
}
