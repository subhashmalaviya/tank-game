import { TANKS } from '../../../shared/src/configs/tanks';
import type { TankId } from '../../../shared/src/types';
export function drawTank(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  id: TankId,
  angle = 35,
  time = 0,
) {
  const d = TANKS[id],
    index = Object.keys(TANKS).indexOf(id);
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  const profiles: Record<TankId, [number, number]> = {
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
  c.scale(...profiles[id]);
  c.fillStyle = '#0005';
  c.beginPath();
  c.ellipse(0, 16, 38, 9, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#111c26';
  c.strokeStyle = '#64717a';
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(-33, 0, 66, 22, 11);
  c.fill();
  c.stroke();
  for (let i = 0; i < 6; i++) {
    c.fillStyle = '#4e5a61';
    c.beginPath();
    c.arc(-23 + i * 9, 11, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#17252c';
    c.beginPath();
    c.arc(-23 + i * 9, 11, 2.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#9cadb5';
    c.lineWidth = 1;
    c.beginPath();
    const rotation = time / 100 + i;
    c.moveTo(-23 + i * 9 + Math.cos(rotation) * 5, 11 + Math.sin(rotation) * 5);
    c.lineTo(-23 + i * 9 - Math.cos(rotation) * 5, 11 - Math.sin(rotation) * 5);
    c.stroke();
  }
  c.fillStyle = d.color;
  c.strokeStyle = '#16252d';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-34, 1);
  c.lineTo(-25, -12);
  c.lineTo(22, -12);
  c.lineTo(34, 1);
  c.lineTo(30, 6);
  c.lineTo(-31, 6);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ffffff25';
  c.fillRect(-22, -9, 42, 4);
  c.fillStyle = '#172a3444';
  c.fillRect(-27, 1, 54, 5);
  c.save();
  c.translate(0, -13);
  c.rotate((-angle * Math.PI) / 180);
  c.fillStyle = '#22343e';
  c.fillRect(4, -4, 38, 8);
  c.fillStyle = d.color;
  c.fillRect(14, -3, 27, 5);
  c.fillStyle = '#243a45';
  c.fillRect(37, -5, 7, 10);
  c.fillStyle = '#fff5';
  c.fillRect(17, -3, 20, 2);
  if (id === 'titan') {
    c.fillStyle = d.color;
    c.fillRect(25, -7, 20, 14);
    c.fillStyle = '#192832';
    c.fillRect(43, -5, 4, 10);
  }
  if (id === 'phantom' || id === 'bastion') {
    c.strokeStyle = d.color;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(18, -6);
    c.lineTo(56, -6);
    c.moveTo(18, 6);
    c.lineTo(56, 6);
    c.stroke();
  }
  if (id === 'volt') {
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = '#e5ffff';
      c.beginPath();
      c.ellipse(15 + i * 7, 0, 3, 9, 0, 0, 7);
      c.stroke();
    }
  }
  if (id === 'inferno') {
    c.fillStyle = '#272c3c';
    c.fillRect(18, -8, 19, 16);
    c.fillStyle = '#ffad76';
    c.fillRect(31, -5, 10, 10);
  }
  if (id === 'frostbite') {
    c.fillStyle = '#d0ffff';
    c.beginPath();
    c.moveTo(15, -8);
    c.lineTo(47, 0);
    c.lineTo(15, 8);
    c.fill();
  }
  if (id === 'viper') {
    c.fillStyle = '#263b3b';
    c.fillRect(4, -14, 28, 28);
    for (let i = 0; i < 3; i++) {
      c.fillStyle = d.color;
      c.fillRect(7, -11 + i * 9, 28, 5);
    }
  }
  if (id === 'quake') {
    c.fillStyle = '#394048';
    c.fillRect(10, -9, 29, 18);
    c.fillStyle = '#e5c5a0';
    c.fillRect(35, -12, 8, 24);
  }
  if (id === 'medic') {
    c.fillStyle = '#e7fff3';
    c.fillRect(12, -8, 28, 4);
    c.fillRect(12, 4, 28, 4);
  }
  if (id === 'nova') {
    c.fillStyle = '#201f3e';
    c.beginPath();
    c.arc(25, 0, 14, 0, 7);
    c.fill();
    c.strokeStyle = d.color;
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = '#fff0ff';
    c.beginPath();
    c.arc(25, 0, 7, 0, 7);
    c.fill();
  }
  c.restore();
  c.fillStyle = d.color;
  c.beginPath();
  c.moveTo(-18, -9);
  c.lineTo(-15, -25 - (index % 3) * 2);
  c.lineTo(10, -27);
  c.lineTo(20, -14);
  c.lineTo(16, -8);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#172c39';
  c.fillRect(-8, -22, 12, 5);
  c.fillStyle = '#def5ed';
  c.fillRect(4, -20, 5, 3);
  if (id === 'titan' || id === 'bastion') {
    c.strokeStyle = '#273e49';
    c.lineWidth = 3;
    c.strokeRect(-24, -7, 15, 8);
    c.strokeRect(12, -7, 13, 8);
    c.fillStyle = '#fff7';
    c.fillRect(-13, -26, 18, 3);
  }
  if (id === 'phantom') {
    c.strokeStyle = '#d9cfff';
    c.beginPath();
    c.moveTo(-20, -22);
    c.lineTo(-27, -35);
    c.stroke();
    c.fillStyle = '#fff';
    c.fillRect(-28, -37, 3, 3);
  }
  if (id === 'volt' || id === 'nova') {
    c.shadowColor = d.color;
    c.shadowBlur = 12;
    c.strokeStyle = '#ecffff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-10, -28);
    c.lineTo(-3, -38);
    c.lineTo(-2, -29);
    c.lineTo(5, -36);
    c.stroke();
    c.shadowBlur = 0;
  }
  if (id === 'viper') {
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#253f43';
      c.fillRect(-18 + i * 9, -34, 7, 12);
      c.fillStyle = '#e8edcc';
      c.fillRect(-17 + i * 9, -37, 5, 5);
    }
  }
  if (id === 'medic') {
    c.fillStyle = '#e9fff3';
    c.fillRect(-6, -22, 4, 12);
    c.fillRect(-10, -18, 12, 4);
  }
  if (id === 'inferno') {
    c.fillStyle = '#263744';
    c.fillRect(-25, -27, 8, 16);
    c.fillStyle = '#f8b575';
    c.fillRect(-24, -29, 6, 7);
  }
  if (id === 'frostbite') {
    c.strokeStyle = '#e6ffff';
    c.lineWidth = 2;
    for (let a = 0; a < 3; a++) {
      c.beginPath();
      c.moveTo(-12 + a * 5, -13);
      c.lineTo(-12 + a * 5, -29);
      c.stroke();
    }
  }
  if (id === 'quake') {
    c.fillStyle = '#65747c';
    c.beginPath();
    c.moveTo(30, -6);
    c.lineTo(42, 13);
    c.lineTo(31, 13);
    c.closePath();
    c.fill();
  }
  c.restore();
}
const cache = new Map<string, string>();
export function tankArt(id: TankId) {
  if (cache.has(id)) return cache.get(id)!;
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 190;
  const c = canvas.getContext('2d')!;
  const d = TANKS[id];
  const g = c.createRadialGradient(180, 100, 10, 180, 100, 150);
  g.addColorStop(0, d.color + '20');
  g.addColorStop(1, d.color + '00');
  c.fillStyle = g;
  c.fillRect(0, 0, 360, 190);
  c.strokeStyle = d.color + '18';
  c.lineWidth = 1;
  c.beginPath();
  c.ellipse(180, 145, 125, 22, 0, 0, Math.PI * 2);
  c.stroke();
  drawTank(c, 180, 117, 2.7, id);
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
export const icons = {
  cross: '✦',
  arrow: '↗',
  chevron: '→',
  bolt: 'ϟ',
  target: '◎',
  shield: '⬡',
  people: '◈',
  close: '×',
};
