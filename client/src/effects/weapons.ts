import type { Shot } from '../../../shared/src/types';
/** Bounded procedural effects: no gameplay decisions, timers, or unbounded particle allocations. */
export function drawWeapon(c: CanvasRenderingContext2D, s: Shot, elapsed: number) {
  const launch = s.launchMs ?? 180,
    impact = s.impactMs ?? 1700,
    age = elapsed - impact;
  if (elapsed < launch) {
    const p = s.path[0];
    if (!p) return;
    c.save();
    c.globalAlpha = (0.6 * elapsed) / Math.max(1, launch);
    c.fillStyle = s.color;
    c.beginPath();
    c.arc(p.x, p.y, 5 + (elapsed / launch) * 12, 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }
  if (elapsed - launch < 100 && s.path[0]) {
    const p = s.path[0],
      burst = 1 - (elapsed - launch) / 100;
    c.save();
    c.globalAlpha = burst;
    c.fillStyle = s.color;
    c.translate(p.x, p.y);
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6,
        r = (i % 2 ? 7 : s.weapon === 'heavy' ? 28 : s.weapon === 'piercing' ? 32 : 17) * burst;
      i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
  c.save();
  c.strokeStyle = s.color;
  c.fillStyle = s.color;
  c.lineWidth = 3;
  if (age < 0) {
    const progress = (elapsed - launch) / Math.max(1, impact - launch),
      idx = Math.min(s.path.length - 1, Math.floor(progress * (s.path.length - 1))),
      p = s.path[idx];
    if (!p) {
      c.restore();
      return;
    }
    const tail =
      s.weapon === 'shadow' || s.weapon === 'piercing'
        ? 18
        : s.weapon === 'cluster' || s.weapon === 'guided'
          ? 10
          : 7;
    c.lineWidth = s.weapon === 'heavy' ? 6 : 3;
    c.beginPath();
    for (let i = Math.max(0, idx - tail); i <= idx; i++) {
      const q = s.path[i];
      i === Math.max(0, idx - tail) ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y);
    }
    c.stroke();
    if (['heavy', 'incendiary', 'seismic'].includes(s.weapon)) {
      for (let i = 0; i < 6; i++) {
        const q = s.path[Math.max(0, idx - i * 2)];
        c.fillStyle = s.weapon === 'incendiary' ? '#ff955899' : '#b5b0a055';
        c.beginPath();
        c.arc(q.x + Math.sin(i * 7) * 5, q.y - i * 2, 2 + i * 0.8, 0, 7);
        c.fill();
      }
    }
    c.translate(p.x, p.y);
    const prev = s.path[Math.max(0, idx - 1)];
    c.rotate(Math.atan2(p.y - prev.y, p.x - prev.x));
    c.fillStyle = '#fff2d9';
    if (s.weapon === 'shadow' || s.weapon === 'piercing') {
      c.fillRect(-16, -2, 32, 4);
    } else if (s.weapon === 'ice') {
      c.beginPath();
      c.moveTo(12, 0);
      c.lineTo(0, -7);
      c.lineTo(-10, 0);
      c.lineTo(0, 7);
      c.closePath();
      c.fill();
    } else if (s.weapon === 'cluster' || s.weapon === 'guided') {
      c.fillRect(-8, -4, 14, 8);
      c.fillStyle = '#ffb364';
      c.beginPath();
      c.moveTo(-8, -4);
      c.lineTo(-24 - Math.sin(elapsed) * 5, 0);
      c.lineTo(-8, 4);
      c.fill();
    } else if (s.weapon === 'seismic') {
      c.rotate(elapsed / 150);
      c.fillStyle = '#ddc1a5';
      c.fillRect(-7, -7, 14, 14);
    } else if (s.weapon === 'electric') {
      c.beginPath();
      c.moveTo(-14, -5);
      c.lineTo(2, 4);
      c.lineTo(-3, -5);
      c.lineTo(15, 2);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(0, 0, s.weapon === 'heavy' ? 8 : s.weapon === 'charged' ? 11 : 5, 0, Math.PI * 2);
      c.fill();
      if (s.weapon === 'charged') {
        c.strokeStyle = s.color;
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.ellipse(0, 0, 18, 6, elapsed / 300 + i, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }
  } else if (age < 750 && s.hit !== false) {
    const t = age / 750,
      r = Math.max(9, s.radius) * t,
      fade = 1 - t;
    c.globalAlpha = fade;
    c.translate(s.impact.x, s.impact.y);
    if (s.weapon === 'piercing') {
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-100 * (1 - t), -12);
      c.lineTo(100 * (1 - t), 12);
      c.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        c.lineTo(Math.cos(a) * r * 2, Math.sin(a) * r * 2);
        c.stroke();
      }
    } else if (s.weapon === 'shadow') {
      c.lineWidth = 4 * (1 - t);
      for (let i = 0; i < 8; i++) {
        c.rotate(Math.PI / 4);
        c.beginPath();
        c.moveTo(8 + t * 15, 0);
        c.lineTo(20 + t * 65, 0);
        c.stroke();
      }
      c.scale(1, 0.25);
      c.beginPath();
      c.arc(0, 0, r, 0, 7);
      c.stroke();
    } else if (s.weapon === 'electric') {
      for (let i = 0; i < 7; i++) {
        c.save();
        c.rotate((i * Math.PI * 2) / 7);
        c.beginPath();
        c.moveTo(0, 0);
        for (let j = 1; j < 6; j++)
          c.lineTo(j * (15 + t * 10), Math.sin(i * 7 + j * 3 + Math.floor(age / 60)) * 15);
        c.stroke();
        c.restore();
      }
    } else if (s.weapon === 'ice') {
      for (let i = 0; i < 10; i++) {
        c.save();
        c.rotate((i * Math.PI) / 5);
        c.translate(r, 0);
        c.beginPath();
        c.moveTo(-8, 0);
        c.lineTo(4, -5);
        c.lineTo(14, 0);
        c.lineTo(4, 5);
        c.fill();
        c.restore();
      }
      c.fillStyle = '#cffaff44';
      c.beginPath();
      c.arc(0, 0, r * 0.7, 0, 7);
      c.fill();
    } else if (s.weapon === 'seismic') {
      c.lineWidth = 5;
      c.beginPath();
      c.ellipse(0, 0, r * 1.6, 12 + t * 12, 0, 0, 7);
      c.stroke();
      for (let i = 0; i < 14; i++) {
        const x = Math.sin(i * 8) * r,
          y = -Math.abs(Math.cos(i * 3)) * 70 * Math.sin(t * Math.PI);
        c.fillRect(x, y, 7 + (i % 5), 7);
      }
    } else if (s.weapon === 'charged') {
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4,
          orbit = s.radius * (1 - Math.min(1, t / 0.4));
        c.fillStyle = s.color;
        c.fillRect(Math.cos(a) * orbit, Math.sin(a) * orbit, 3, 3);
      }
      const radius = t < 0.3 ? (1 - t / 0.3) * s.radius : (s.radius * (t - 0.3)) / 0.7;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, 0, Math.max(2, radius), 0, 7);
      c.stroke();
      c.fillStyle = '#0e0b26';
      c.beginPath();
      c.arc(0, 0, Math.max(1, 18 * (1 - t)), 0, 7);
      c.fill();
    } else if (s.weapon === 'plasma') {
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(0, 0, r * (0.5 + i * 0.25), 0, 7);
        c.stroke();
      }
    } else {
      c.fillStyle = s.weapon === 'incendiary' ? '#ff5b2377' : '#ffb45f55';
      c.beginPath();
      c.arc(0, 0, r * 0.8 + 10 * (1 - t), 0, 7);
      c.fill();
      c.lineWidth = s.weapon === 'heavy' ? 5 : 2;
      c.beginPath();
      c.arc(0, 0, r * 1.35, 0, 7);
      c.stroke();
      for (let i = 0; i < (s.weapon === 'heavy' ? 24 : 12); i++) {
        const a = i * 2.4;
        c.fillStyle = i % 2 ? s.color : '#fff1bf';
        c.fillRect(
          Math.cos(a) * r,
          Math.sin(a) * r - 40 * t,
          4 + 3 * fade,
          s.weapon === 'incendiary' ? 12 : 5,
        );
      }
    }
  }
  c.restore();
  if (age >= 0 && age < 750) {
    c.save();
    c.globalAlpha = 1 - age / 750;
    c.font = 'bold 21px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#fff4dc';
    for (const d of s.damage) {
      if (d.amount) {
        c.font = 'bold 21px sans-serif';
        c.fillStyle = '#fff4dc';
        c.fillText('−' + d.amount, d.x, d.y - 65 - age / 25);
      }
      if (d.absorbed) {
        c.fillStyle = '#a6e6ff';
        c.font = 'bold 14px sans-serif';
        c.fillText('SHIELD −' + d.absorbed, d.x, d.y - (d.amount ? 88 : 65) - age / 25);
      }
    }
    c.restore();
  }
}
