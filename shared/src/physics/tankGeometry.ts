import { TANK_IDS } from '../configs/tanks';
import type { Fighter, TankId } from '../types';
/** Body geometry is shared by original artwork and authoritative collision.
 * Barrels, antennae and effects are decorative and never change a hidden plan's hitbox. */
export const TANK_PROFILES: Record<TankId, [number, number]> = {
  titan: [1.2, 1.12],
  phantom: [1.12, 0.72],
  volt: [0.9, 1.18],
  inferno: [1.02, 1],
  frostbite: [0.95, 1.05],
  viper: [1.15, 0.92],
  bastion: [1.2, 1],
  quake: [1.28, 1.15],
  medic: [1.05, 0.9],
  nova: [0.85, 1.12],
};
export const HULL: readonly (readonly [number, number])[] = [
  [-34, 1],
  [-25, -12],
  [22, -12],
  [34, 1],
  [30, 6],
  [-31, 6],
];
type Polygon = readonly (readonly [number, number])[];
const turrets = Object.fromEntries(
  TANK_IDS.map((id, index): [TankId, Polygon] => [
    id,
    [
      [-18, -9],
      [-15, -25 - (index % 3) * 2],
      [10, -27],
      [20, -14],
      [16, -8],
    ],
  ]),
);
export const turretPolygon = (tank: TankId): Polygon => turrets[tank];
function inside(points: readonly (readonly [number, number])[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j],
      [bx, by] = points[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (
      Math.abs(cross) < 1e-7 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}
export function tankContains(t: Pick<Fighter, 'x' | 'y' | 'tank'>, px: number, py: number) {
  const [sx, sy] = TANK_PROFILES[t.tank],
    x = (px - t.x) / sx,
    y = (py - t.y) / sy;
  if (x < -34 || x > 34 || y < -30 || y > 22) return false;
  const tracks =
    y >= 0 && y <= 22 && (Math.abs(x) <= 22 || (Math.abs(x) - 22) ** 2 + (y - 11) ** 2 <= 121);
  return tracks || inside(HULL, x, y) || inside(turretPolygon(t.tank), x, y);
}
