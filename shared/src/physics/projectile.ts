import { HEIGHT, WIDTH, Terrain } from '../maps/terrain';
import type { Fighter, Point, Weapon } from '../types';
export interface Flight {
  path: Point[];
  impact: Point;
  directId?: string;
  hit: boolean;
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
  for (let i = 0; i < 1200; i++) {
    if (weapon.behavior === 'guided' && i > 30) {
      const target = fighters
        .filter(
          (t) =>
            t.id !== ownerId &&
            t.hp > 0 &&
            !t.statuses.cloak &&
            (!teamMode || t.team !== fighters.find((f) => f.id === ownerId)?.team),
        )
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (target) {
        const dx = target.x - x;
        vx += Math.sign(dx) * 1.2;
      }
    }
    // Alien maps contain a low-gravity central field.
    const g = gravity * (gravity === 165 && x > 500 && x < 940 ? 0.6 : 1) * weapon.gravity;
    vy += g / 60;
    const nx = x + vx / 60,
      ny = y + vy / 60,
      steps = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 3));
    let bounced = false;
    for (let j = 1; j <= steps; j++) {
      const px = x + ((nx - x) * j) / steps,
        py = y + ((ny - y) * j) / steps;
      const target = fighters.find(
        (t) =>
          t.hp > 0 &&
          (t.id !== ownerId || i > 12) &&
          Math.abs(t.x - px) < 18 &&
          Math.abs(t.y - py) < 14,
      );
      if (target) {
        path.push({ x: px, y: py });
        return { path, impact: { x: px, y: py }, directId: target.id, hit: true };
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
        return { path, impact: { x: px, y: py }, hit: true };
      }
    }
    if (bounced) continue;
    x = nx;
    y = ny;
    if (i % 3 === 0) path.push({ x, y });
    if (x < -80 || x > WIDTH + 80 || y > HEIGHT + 80) {
      path.push({ x, y });
      return { path, impact: { x, y }, hit: false };
    }
  }
  return { path, impact: { x, y }, hit: false };
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
