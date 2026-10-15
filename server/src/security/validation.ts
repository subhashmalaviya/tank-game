import { z } from 'zod';
import { TANK_IDS } from '../../../shared/src/configs/tanks';
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Use letters, numbers, spaces, dots or dashes.');
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/);
export const tankSchema = z.string().refine((v) => TANK_IDS.includes(v as any));
export class Limiter {
  private bins = new Map<string, { at: number; count: number }>();
  constructor(
    private limit = 45,
    private window = 10000,
  ) {}
  allow(key: string, now = Date.now()) {
    let bin = this.bins.get(key);
    if (!bin || now - bin.at >= this.window) {
      bin = { at: now, count: 0 };
      this.bins.set(key, bin);
    }
    return ++bin.count <= this.limit;
  }
  clean(now = Date.now()) {
    for (const [key, b] of this.bins) if (now - b.at > this.window) this.bins.delete(key);
  }
}
