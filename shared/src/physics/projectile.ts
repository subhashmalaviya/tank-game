import { tankContains } from './tankGeometry';
import { coverAt } from '../maps/environment';
import type { Environment } from '../types';
import { HEIGHT, WIDTH, Terrain } from '../maps/terrain';
import type { Fighter, Point, Weapon } from '../types';
export interface ReflectionShield {
  remaining: number;
  facing: number;
  directional: boolean;
}
export interface Flight {
  reflections?: { x: number; y: number; defender: string }[];
  reflectedBy?: string;
  path: Point[];
  impact: Point;
  directId?: string;
  hit: boolean;
  durationMs: number;
  coverId?: string;
}
export function projectile(
  origin: Point,
  angle: number,
  power: number,
  weapon: Weapon,
  gravity: number,
  terrain: Terrain,
  fighters: Fighter[],
  ownerId: string,
  teamMode = false,
  environment?: Environment,
  shields?: Map<string, ReflectionShield>,
  guidedTargetId?: string,
): Flight {
  const rad = (angle * Math.PI) / 180,
    speed = (weapon.speed * power) / 100;
  let x = origin.x + Math.cos(rad) * 28,
    y = origin.y - Math.sin(rad) * 28,
    vx = Math.cos(rad) * speed,
    vy = -Math.sin(rad) * speed,
    bounces = 0,
    pierced = false;
  const path: Point[] = [{ x, y }];
  const reflections: { x: number; y: number; defender: string }[] = [];
  let reflectedBy: string | undefined;
  let reflectionTick = -1;
  const reflectionResult = () => ({ reflections, reflectedBy });
  for (let i = 0; i < 1200; i++) {
    if (weapon.behavior === 'guided' && i > 30) {
      const target = fighters
        .filter(
          (t) =>
            (reflectedBy ? t.id === ownerId : !guidedTargetId || t.id === guidedTargetId) &&
            t.id !== (reflectedBy ?? ownerId) &&
            t.hp > 0 &&
            !t.statuses.cloak &&
            (!teamMode || t.team !== fighters.find((f) => f.id === (reflectedBy ?? ownerId))?.team),
        )
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (target) {
        const dx = target.x - x;
        vx += Math.sign(dx) * 1.2;
      }
    }
    // Alien maps contain a low-gravity central field.
    vx += (environment?.wind ?? 0) / 60;
    const zone = environment?.gravityZones.find((z) => x >= z.from && x <= z.to);
    const g =
      gravity *
      (zone?.multiplier ?? (environment ? 1 : gravity === 165 && x > 500 && x < 940 ? 0.6 : 1)) *
      weapon.gravity;
    vy += g / 60;
    const nx = x + vx / 60,
      ny = y + vy / 60,
      steps = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 3));
    let bounced = false;
    for (let j = 1; j <= steps; j++) {
      const px = x + ((nx - x) * j) / steps,
        py = y + ((ny - y) * j) / steps;
      if (!reflectedBy && shields && weapon.behavior !== 'pierce') {
        const defender = fighters.find((t) => {
          const shield = shields.get(t.id);
          const attacker = fighters.find((f) => f.id === ownerId);
          return (
            shield &&
            shield.remaining > 0 &&
            t.hp > 0 &&
            t.id !== ownerId &&
            (!teamMode || t.team !== attacker?.team) &&
            Math.hypot(px - t.x, py - t.y) < 42 &&
            (!shield.directional || (px - t.x) * shield.facing >= 0) &&
            (px - t.x) * vx + (py - t.y) * vy < 0
          );
        });
        if (defender) {
          shields.get(defender.id)!.remaining--;
          reflectedBy = defender.id;
          reflectionTick = i;
          reflections.push({ x: px, y: py, defender: defender.id });
          path.push({ x: px, y: py });
          // Specular reflection around the shield surface normal; only one reflection per projectile.
          const length = Math.max(1, Math.hypot(px - defender.x, py - defender.y));
          const normalX = (px - defender.x) / length,
            normalY = (py - defender.y) / length;
          const dot = vx * normalX + vy * normalY;
          vx -= 2 * dot * normalX;
          vy -= 2 * dot * normalY;
          x = px + normalX * 4;
          y = py + normalY * 4;
          bounced = true;
          break;
        }
      }
      const target = fighters.find(
        (t) =>
          t.hp > 0 &&
          (t.id !== reflectedBy || i - reflectionTick > 6) &&
          (t.id !== ownerId || i > 12 || !!reflectedBy) &&
          tankContains(t, px, py),
      );
      if (target) {
        path.push({ x: px, y: py });
        return {
          ...reflectionResult(),
          path,
          impact: { x: px, y: py },
          directId: target.id,
          hit: true,
          durationMs: ((i + 1) * 1000) / 60,
        };
      }
      const cover = coverAt(environment, px, py);
      if (cover) {
        path.push({ x: px, y: py });
        return {
          ...reflectionResult(),
          path,
          impact: { x: px, y: py },
          hit: true,
          coverId: cover.id,
          durationMs: ((i + 1) * 1000) / 60,
        };
      }
      if (terrain.solid(px, py)) {
        if (weapon.behavior === 'bounce' && bounces < 2) {
          vx *= 0.72;
          vy = -Math.max(95, Math.abs(vy) * 0.6);
          y = py - 6;
          x = px;
          bounces++;
          bounced = true;
          path.push({ x, y });
          break;
        }
        if (weapon.behavior === 'pierce' && !pierced) {
          pierced = true;
          continue;
        }
        path.push({ x: px, y: py });
        return {
          ...reflectionResult(),
          path,
          impact: { x: px, y: py },
          hit: true,
          durationMs: ((i + 1) * 1000) / 60,
        };
      }
    }
    if (bounced) continue;
    x = nx;
    y = ny;
    if (i % 3 === 0) path.push({ x, y });
    if (x < -80 || x > WIDTH + 80 || y > HEIGHT + 80) {
      path.push({ x, y });
      return {
        ...reflectionResult(),
        path,
        impact: { x, y },
        hit: false,
        durationMs: path.length * 50,
      };
    }
  }
  return {
    ...reflectionResult(),
    path,
    impact: { x, y },
    hit: false,
    durationMs: path.length * 50,
  };
}
export function preview(
  origin: Point,
  angle: number,
  power: number,
  weapon: Weapon,
  gravity: number,
): Point[] {
  const r = (angle * Math.PI) / 180,
    v = (weapon.speed * power) / 100;
  return Array.from({ length: 28 }, (_, i) => {
    const t = i * 0.045;
    return {
      x: origin.x + Math.cos(r) * (28 + v * t),
      y: origin.y - Math.sin(r) * (28 + v * t) + 0.5 * gravity * weapon.gravity * t * t,
    };
  });
}
