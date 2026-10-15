import { mapById } from '../configs/maps';
import type { Hazard, Point } from '../types';
export const WIDTH = 1440,
  HEIGHT = 720,
  CELL = 4,
  COLS = WIDTH / CELL,
  ROWS = HEIGHT / CELL;
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Terrain {
  data: Uint8Array;
  constructor(data?: Uint8Array) {
    this.data = data ?? new Uint8Array(COLS * ROWS);
  }
  solid(x: number, y: number) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return false;
    return this.data[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)] === 1;
  }
  crater(x: number, y: number, r: number) {
    for (
      let cy = Math.max(0, Math.floor((y - r) / CELL));
      cy < Math.min(ROWS, Math.ceil((y + r) / CELL));
      cy++
    )
      for (
        let cx = Math.max(0, Math.floor((x - r) / CELL));
        cx < Math.min(COLS, Math.ceil((x + r) / CELL));
        cx++
      )
        if ((cx * CELL + 2 - x) ** 2 + (cy * CELL + 2 - y) ** 2 <= r * r)
          this.data[cy * COLS + cx] = 0;
  }
  surface(x: number, from = 0) {
    for (let y = Math.max(0, Math.floor(from / CELL) * CELL); y < HEIGHT; y += CELL)
      if (this.solid(x, y)) return y;
    return HEIGHT + 80;
  }
  pack() {
    const out: number[] = [];
    let last = 0,
      count = 0;
    for (const v of this.data) {
      if (v === last) count++;
      else {
        out.push(count);
        last = v;
        count = 1;
      }
    }
    out.push(count);
    return out;
  }
  static unpack(runs: number[]) {
    const data = new Uint8Array(COLS * ROWS);
    let pos = 0,
      val = 0;
    for (const count of runs) {
      data.fill(val, pos, pos + count);
      pos += count;
      val = 1 - val;
    }
    return new Terrain(data);
  }
}
export function generateMap(
  seed: number,
  mapId: string,
  players: number,
): { terrain: Terrain; spawns: Point[]; hazards: Hazard[] } {
  const rng = random(seed),
    theme = mapById(mapId),
    terrain = new Terrain(),
    phase = rng() * 6.28,
    phase2 = rng() * 6.28;
  const spawnXs = Array.from(
    { length: players },
    (_, i) => 100 + (i * (WIDTH - 200)) / Math.max(1, players - 1),
  );
  const heights = Array.from(
    { length: COLS },
    (_, i) =>
      Math.round(
        (405 +
          Math.sin(i / 38 + phase) * theme.roughness +
          Math.sin(i / 15 + phase2) * theme.roughness * 0.42 +
          Math.sin(i / 6 + phase) * 7) /
          CELL,
      ) * CELL,
  );
  for (const x of spawnXs) {
    const h = heights[Math.floor(x / CELL)];
    for (let c = Math.floor((x - 30) / CELL); c <= Math.floor((x + 30) / CELL); c++) heights[c] = h;
  }
  for (let x = 0; x < COLS; x++) {
    const px = x * CELL,
      nearest = Math.min(...spawnXs.map((s) => Math.abs(s - px))),
      gap = theme.islands && nearest > 65 && Math.sin(px / 85 + phase) > 0.6;
    if (gap) continue;
    const bottom = theme.islands
      ? Math.min(HEIGHT, heights[x] + 100 + Math.cos(x / 8) * 24)
      : HEIGHT;
    for (let y = heights[x] / CELL; y < Math.floor(bottom / CELL); y++)
      terrain.data[y * COLS + x] = 1;
  }
  const spawns = spawnXs.map((x) => ({ x, y: terrain.surface(x) - 12 }));
  const hazards: Hazard[] = [];
  if (theme.hazard)
    for (let i = 0; i < 4; i++) {
      const x = 140 + rng() * (WIDTH - 280);
      if (spawnXs.every((s) => Math.abs(x - s) > 90))
        hazards.push({ x, y: terrain.surface(x) - 3, radius: 38, kind: theme.hazard, turns: 9999 });
    }
  return { terrain, spawns, hazards };
}
