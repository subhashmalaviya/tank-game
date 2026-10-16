import type { MatchState } from '../../../shared/src/types';
import { TANKS } from '../../../shared/src/configs/tanks';
import { SUPERPOWERS } from '../../../shared/src/configs/superpowers';
import { drawTank } from '../ui/art';
/** Cosmetic replay only: all paths, targets and outcomes come from the server. */
export function drawSuperpowers(
  c: CanvasRenderingContext2D,
  s: MatchState,
  elapsed: number,
  reduced: boolean,
) {
  for (const e of s.superEvents ?? []) {
    const t = reduced ? 1 : Math.min(1, Math.max(0, elapsed / e.durationMs));
    if (elapsed > e.durationMs && !['titan', 'bastion'].includes(e.tank)) continue;
    c.save();
    c.strokeStyle = TANKS[e.tank].color;
    c.fillStyle = TANKS[e.tank].color;
    c.lineWidth = 3;
    c.globalAlpha = reduced ? 0.65 : 0.85;
    const ring = (x: number, y: number, r: number) => {
      c.beginPath();
      c.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
      c.stroke();
    };
    if (!e.cancelled)
      switch (e.tank) {
        case 'titan':
          c.strokeStyle = '#ffd778';
          c.beginPath();
          c.arc(
            e.from.x,
            e.from.y,
            43,
            (e.facing === -1 ? Math.PI : 0) - Math.PI * 0.5,
            (e.facing === -1 ? Math.PI : 0) + Math.PI * 0.5,
          );
          c.stroke();
          break;
        case 'bastion':
          c.beginPath();
          for (let i = 0; i <= 6; i++) {
            const a = (i * Math.PI) / 3;
            c.lineTo(e.from.x + 48 * Math.cos(a), e.from.y + 48 * Math.sin(a));
          }
          c.stroke();
          ring(e.from.x, e.from.y, 40);
          break;
        case 'phantom':
          if (e.path.length) {
            const index = Math.min(e.path.length - 1, Math.floor(t * (e.path.length - 1)));
            for (let j = 1; j < (reduced ? 1 : 4); j++) {
              const p = e.path[Math.max(0, index - j * 2)];
              c.globalAlpha = 0.7 / (j + 1);
              drawTank(c, p.x, p.y, 1, 'phantom');
            }
          }
          break;
        case 'volt': {
          let p = e.from;
          for (const q of e.targets) {
            c.beginPath();
            c.moveTo(p.x, p.y);
            for (let i = 1; i <= 12; i++) {
              const a = i / 12;
              c.lineTo(
                p.x + (q.x - p.x) * a,
                p.y + (q.y - p.y) * a + (i < 12 ? Math.sin(i * 23 + Math.floor(t * 12)) * 12 : 0),
              );
            }
            c.stroke();
            ring(q.x, q.y, 12 + t * 20);
            p = q;
          }
          break;
        }
        case 'inferno':
          c.globalAlpha = 0.14;
          c.fillRect(e.to.x - 145, 0, 290, 720);
          c.globalAlpha = 0.85;
          ring(e.to.x, e.to.y, 145);
          break;
        case 'frostbite':
          ring(e.from.x, e.from.y, t * SUPERPOWERS.frostbite.range);
          for (const p of e.targets) {
            for (let i = 0; i < 5; i++) {
              c.beginPath();
              c.moveTo(p.x - 30 + i * 15, p.y + 12);
              c.lineTo(p.x - 25 + i * 15, p.y - 32);
              c.lineTo(p.x - 20 + i * 15, p.y + 12);
              c.stroke();
            }
          }
          break;
        case 'viper':
          for (let i = 0; i < 5; i++)
            c.strokeRect(e.from.x - 25 + i * 10, e.from.y - 35 - t * 8, 7, 23);
          ring(e.to.x, e.to.y, 30);
          break;
        case 'quake':
          c.beginPath();
          for (const p of e.path.slice(0, Math.ceil(t * e.path.length))) c.lineTo(p.x, p.y - 6);
          c.stroke();
          for (const p of e.path.filter((_, i) => i % 3 === 0))
            c.fillRect(p.x, p.y - 20 * Math.sin(t * Math.PI), 5, 5);
          break;
        case 'medic':
          for (const p of e.targets) {
            ring(p.x, p.y, 30 + t * 35);
            c.fillRect(p.x - 3, p.y - 40, 6, 24);
            c.fillRect(p.x - 12, p.y - 31, 24, 6);
          }
          break;
        case 'nova':
          ring(e.to.x, e.to.y, 180 * (1 - t) + 8);
          for (let i = 0; i < 16; i++) {
            const a = (i * Math.PI) / 8 + t * 3,
              r = (1 - t) * 180;
            c.fillRect(e.to.x + Math.cos(a) * r, e.to.y + Math.sin(a) * r, 3, 3);
          }
          break;
      }
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.fillText(
      SUPERPOWERS[e.tank].name + (e.cancelled ? ' · LANDING BLOCKED' : ''),
      e.from.x,
      e.from.y - 65,
    );
    c.restore();
  }
  for (const shot of s.shots)
    for (const r of shot.reflections ?? []) {
      const index = shot.path.findIndex((p) => p.x === r.x && p.y === r.y);
      const at =
        (shot.launchMs ?? 0) +
        ((shot.impactMs! - (shot.launchMs ?? 0)) * index) / Math.max(1, shot.path.length - 1);
      if (elapsed < at || elapsed > at + 400) continue;
      c.save();
      c.strokeStyle = '#ffe99a';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(r.x, r.y, 8 + (elapsed - at) / 15, 0, 7);
      c.stroke();
      c.restore();
    }
}
