import type { Fighter, MatchState } from '../../../shared/src/types';
/** Presentation only: replay server-confirmed health/shield deltas at their impact time.
 * The original snapshot remains untouched; the next authoritative state replaces this view. */
export function fightersAtImpact(state: MatchState, elapsed: number): Fighter[] {
  if (!state.resolveAt || state.result || !state.resolutionStart) return state.fighters;
  const totals = new Map<string, { hp: number; shield: number }>();
  for (const shot of state.shots) {
    if (elapsed < (shot.impactMs ?? Infinity)) continue;
    for (const d of shot.damage) {
      const total = totals.get(d.id) ?? { hp: 0, shield: 0 };
      total.hp += d.amount;
      total.shield += d.absorbed ?? 0;
      totals.set(d.id, total);
    }
  }
  return state.fighters.map((f) => {
    const start = state.resolutionStart!.find((s) => s.id === f.id),
      loss = totals.get(f.id);
    if (!start) return f;
    let position = { x: f.x, y: f.y };
    for (const e of state.superEvents ?? []) {
      if (e.tank === 'phantom' && e.owner === f.id && e.path.length) {
        const t = Math.min(1, Math.max(0, elapsed / 900));
        position = e.path[Math.min(e.path.length - 1, Math.floor(t * (e.path.length - 1)))];
      }
      if (e.tank === 'nova') {
        const target = e.targets.find((p) => p.id === f.id);
        if (target) {
          const t = Math.min(1, Math.max(0, elapsed / 900));
          position = { x: f.x + (target.x - f.x) * t, y: f.y + (target.y - f.y) * t };
        }
      }
    }
    return {
      ...f,
      ...position,
      hp: f.hp === 0 && state.phase === 'resolving' ? 0 : Math.max(0, start.hp - (loss?.hp ?? 0)),
      statuses: { ...f.statuses, shield: Math.max(0, start.shield - (loss?.shield ?? 0)) },
    };
  });
}
