import Phaser from 'phaser';
import {
  generateMap,
  Terrain,
  WIDTH,
  HEIGHT,
  CELL,
  COLS,
  ROWS,
  random,
} from '../../../shared/src/maps/terrain';
import { mapById } from '../../../shared/src/configs/maps';
import { TANKS } from '../../../shared/src/configs/tanks';
import { WEAPONS } from '../../../shared/src/configs/weapons';
import { preview } from '../../../shared/src/physics/projectile';
import type { MatchState, Fighter, Shot } from '../../../shared/src/types';
import { drawTank } from '../ui/art';
import { sound } from '../audio/sound';
export class BattleScene extends Phaser.Scene {
  private texture!: Phaser.Textures.CanvasTexture;
  private ctx!: CanvasRenderingContext2D;
  private ground = document.createElement('canvas');
  private terrain?: Terrain;
  private state: MatchState | null = null;
  private mapId = 'desert';
  private revision = -1;
  private demo = false;
  private shots: Shot[] = [];
  private shotAt = 0;
  private shotKey = '';
  private impactSound = false;
  private pulses: { x: number; y: number; color: string; label: string; at: number }[] = [];
  playerId = '';
  angle = 45;
  power = 65;
  weapon = 'standard';
  onAim?: (angle: number) => void;
  constructor() {
    super('battle');
  }
  create() {
    this.texture = this.textures.createCanvas('world', WIDTH, HEIGHT)!;
    this.ctx = this.texture.context;
    this.add.image(0, 0, 'world').setOrigin(0);
    this.ground.width = WIDTH;
    this.ground.height = HEIGHT;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.state && this.state.activeId === this.playerId && !this.state.resolveAt) {
        const actor = this.state.fighters.find((f) => f.id === this.playerId);
        if (actor) {
          const a = (Math.atan2(actor.y - p.y, p.x - actor.x) * 180) / Math.PI;
          this.angle = Phaser.Math.Clamp(Math.round(a), 5, 175);
          this.onAim?.(this.angle);
        }
      }
    });
    if (!this.state) this.setDemo();
    else this.setState(this.state);
  }
  setDemo() {
    this.demo = true;
    this.state = null;
    this.mapId = 'desert';
    this.terrain = generateMap(7862, 'desert', 4).terrain;
    if (this.ctx) this.paintGround();
  }
  setState(state: MatchState) {
    this.demo = false;
    const previous = this.state;
    if (previous && previous.id === state.id) {
      for (const f of state.fighters) {
        const old = previous.fighters.find((p) => p.id === f.id);
        if (old && f.cooldown > old.cooldown) {
          this.pulses.push({
            x: f.x,
            y: f.y,
            color: TANKS[f.tank].color,
            label: TANKS[f.tank].ability.name.toUpperCase(),
            at: performance.now(),
          });
          if (f.tank === 'quake') this.cameras?.main?.shake(220, 0.005);
        }
      }
    }
    this.state = state;
    this.mapId = state.map;
    if (!this.ctx) return;
    if (this.revision !== state.revision) {
      this.terrain = Terrain.unpack(state.terrain);
      this.paintGround();
      this.revision = state.revision;
    }
    const key = state.id + ':' + state.turn;
    if (state.shots.length && key !== this.shotKey) {
      this.shotKey = key;
      this.shots = state.shots;
      this.shotAt = performance.now();
      this.impactSound = false;
      sound.fire();
    }
  }
  private paintGround() {
    if (!this.terrain) return;
    const c = this.ground.getContext('2d')!,
      theme = mapById(this.mapId);
    c.clearRect(0, 0, WIDTH, HEIGHT);
    const g = c.createLinearGradient(0, 280, 0, HEIGHT);
    g.addColorStop(0, theme.earth);
    g.addColorStop(1, '#202a32');
    c.fillStyle = g;
    for (let y = 0; y < ROWS; y++) {
      let start = -1;
      for (let x = 0; x <= COLS; x++) {
        const solid = x < COLS && this.terrain.data[y * COLS + x];
        if (solid && start < 0) start = x;
        else if (!solid && start >= 0) {
          c.fillRect(start * CELL, y * CELL, (x - start) * CELL, CELL);
          start = -1;
        }
      }
    }
    c.fillStyle = theme.surface;
    for (let x = 0; x < COLS; x++)
      for (let y = 1; y < ROWS; y++)
        if (this.terrain.data[y * COLS + x] && !this.terrain.data[(y - 1) * COLS + x])
          c.fillRect(x * CELL, y * CELL, CELL, 4);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.strokeStyle = theme.surface + '22';
    c.lineWidth = 2;
    for (let layer = 0; layer < 7; layer++) {
      c.beginPath();
      for (let x = 0; x <= WIDTH; x += 12) {
        const y = 440 + layer * 48 + Math.sin(x / 160 + layer) * 24;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    const rng = random(122);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = i % 2 ? '#0c1a2622' : theme.surface + '22';
      c.fillRect(rng() * WIDTH, 330 + rng() * 390, 2 + rng() * 6, 2);
    }
    c.restore();
  }
  update(time: number) {
    if (!this.ctx || !this.terrain) return;
    const c = this.ctx,
      theme = mapById(this.mapId);
    c.clearRect(0, 0, WIDTH, HEIGHT);
    const sky = c.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, theme.sky);
    sky.addColorStop(0.7, theme.horizon);
    sky.addColorStop(1, theme.earth);
    c.fillStyle = sky;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    const rng = random(73);
    c.fillStyle = '#fff8';
    for (let i = 0; i < 60; i++) {
      const x = rng() * WIDTH,
        y = rng() * 290;
      c.globalAlpha = 0.15 + rng() * 0.5;
      c.fillRect(x, y, 1.5, 1.5);
    }
    c.globalAlpha = 1;
    const sunX = this.demo ? 1010 : 1120;
    c.fillStyle = theme.surface + '20';
    c.beginPath();
    c.arc(sunX, 190, 75, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = theme.surface + '90';
    c.beginPath();
    c.arc(sunX, 190, 52, 0, Math.PI * 2);
    c.fill();
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = [theme.earth + '33', theme.earth + '66', theme.earth + 'aa'][layer];
      c.beginPath();
      c.moveTo(0, HEIGHT);
      for (let x = 0; x <= WIDTH; x += 24) {
        let y =
          335 +
          layer * 47 +
          Math.sin(x / (150 - layer * 25) + layer * 2) * 70 +
          Math.sin(x / 62 + layer) * 24;
        if (this.mapId === 'neon' || this.mapId === 'industrial')
          y = 340 + layer * 50 - Math.floor(Math.sin(Math.floor(x / 70) * 4 + layer) * 50);
        c.lineTo(x, y);
      }
      c.lineTo(WIDTH, HEIGHT);
      c.closePath();
      c.fill();
    }
    c.drawImage(this.ground, 0, 0);
    // Original environmental props, anchored to the terrain surface.
    for (let i = 0; i < 17; i++) {
      const x = 32 + i * 83,
        y = this.terrain.surface(x);
      if (y > HEIGHT) continue;
      c.fillStyle = theme.surface + '70';
      if (this.mapId === 'jungle') {
        c.fillStyle = '#274d3e';
        c.fillRect(x, y - 45, 5, 45);
        c.beginPath();
        c.moveTo(x - 23, y - 28);
        c.lineTo(x + 3, y - 76);
        c.lineTo(x + 28, y - 28);
        c.fill();
      } else if (this.mapId === 'alien' || this.mapId === 'frozen') {
        c.beginPath();
        c.moveTo(x - 8, y);
        c.lineTo(x - 2, y - 28);
        c.lineTo(x + 9, y - 9);
        c.lineTo(x + 6, y);
        c.fill();
      } else if (this.mapId === 'neon') {
        c.fillStyle = '#b793dc';
        c.fillRect(x, y - 20, 3, 20);
        c.fillStyle = '#ecc6ef';
        c.fillRect(x - 2, y - 22, 8, 3);
      } else {
        c.beginPath();
        c.moveTo(x - 11, y);
        c.lineTo(x - 6, y - 7);
        c.lineTo(x + 5, y - 10);
        c.lineTo(x + 13, y);
        c.fill();
      }
    }
    if (this.state) {
      for (const h of this.state.hazards) {
        c.fillStyle =
          h.kind === 'toxic' ? '#c1ec5750' : h.kind === 'energy' ? '#d2a1ff55' : '#ff814955';
        c.beginPath();
        c.ellipse(h.x, h.y, h.radius, 9 + Math.sin(time / 250) * 3, 0, 0, Math.PI * 2);
        c.fill();
        for (let i = 0; i < 6; i++) {
          c.fillStyle = h.kind === 'toxic' ? '#d4f68d88' : '#ffd39688';
          const x = h.x + Math.sin(i * 4) * h.radius * 0.8;
          c.fillRect(x, h.y - ((time / 40 + i * 13) % 30), 3, 5);
        }
      }
      for (const f of this.state.fighters) this.tank(c, f, time);
      const a = this.state.fighters.find((f) => f.id === this.playerId);
      if (a && a.hp > 0 && this.state.activeId === a.id && !this.state.resolveAt) {
        c.fillStyle = '#fff9';
        const points = preview(
          a,
          this.angle,
          this.power,
          WEAPONS[this.weapon] ?? WEAPONS.standard,
          theme.gravity,
        );
        points.forEach((p, i) => {
          c.globalAlpha = 1 - i / points.length;
          c.beginPath();
          c.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          c.fill();
        });
        c.globalAlpha = 1;
      }
    } else this.drawDemo(c, time);
    this.drawShots(c);
    this.pulses = this.pulses.filter((p) => performance.now() - p.at < 1300);
    for (const p of this.pulses) {
      const age = (performance.now() - p.at) / 1300;
      c.globalAlpha = 1 - age;
      c.strokeStyle = p.color;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(p.x, p.y, 30 + age * 180, 20 + age * 100, 0, 0, Math.PI * 2);
      c.stroke();
      c.font = 'bold 13px sans-serif';
      c.textAlign = 'center';
      c.fillStyle = p.color;
      c.fillText(p.label, p.x, p.y - 90 - age * 35);
      c.globalAlpha = 1;
    }
    const vignette = c.createLinearGradient(0, HEIGHT - 140, 0, HEIGHT);
    vignette.addColorStop(0, '#0b121900');
    vignette.addColorStop(1, '#0b1219aa');
    c.fillStyle = vignette;
    c.fillRect(0, HEIGHT - 140, WIDTH, 140);
    this.texture.refresh();
  }
  private tank(c: CanvasRenderingContext2D, f: Fighter, time: number) {
    if (f.x < 0) return;
    const active = f.id === this.state?.activeId,
      own = f.id === this.playerId;
    c.save();
    if (f.hp <= 0) c.globalAlpha = 0.3;
    if (f.statuses.cloak) c.globalAlpha = 0.3;
    const recoil =
      this.shots.some((s) => s.owner === f.id) && performance.now() - this.shotAt < 200
        ? Math.sin(((performance.now() - this.shotAt) / 200) * Math.PI) * 5
        : 0;
    drawTank(
      c,
      f.x - Math.sign(Math.cos((f.angle * Math.PI) / 180)) * recoil,
      f.y,
      1,
      f.tank,
      own && active ? this.angle : f.angle,
    );
    c.restore();
    if (f.hp <= 0) {
      c.fillStyle = '#a7aeb5';
      c.font = 'bold 12px sans-serif';
      c.textAlign = 'center';
      c.fillText('ELIMINATED', f.x, f.y - 50);
      return;
    }
    if (f.statuses.shield || f.statuses.fortify) {
      c.strokeStyle = TANKS[f.tank].color + '99';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(f.x, f.y - 2, 42, Math.PI, Math.PI * 2);
      c.stroke();
    }
    if (f.statuses.freeze) {
      c.strokeStyle = '#bef7ff';
      c.strokeRect(f.x - 36, f.y - 34, 72, 55);
    }
    if (f.statuses.burn) {
      c.fillStyle = '#ffab64';
      for (let i = 0; i < 4; i++)
        c.fillRect(f.x - 25 + i * 15, f.y - 25 - Math.sin(time / 140 + i) * 10, 4, 12);
    }
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#f9f3e4';
    c.fillText(
      `${this.state?.config.mode === 'teams' ? 'T' + (f.team + 1) + ' · ' : ''}${f.name}${own ? ' · YOU' : ''}`,
      f.x,
      f.y - 54,
    );
    c.fillStyle = '#101e2a';
    c.fillRect(f.x - 28, f.y - 44, 56, 5);
    c.fillStyle = TANKS[f.tank].color;
    c.fillRect(f.x - 28, f.y - 44, (56 * f.hp) / f.maxHp, 5);
    if (active) {
      c.fillStyle = '#f3bb77';
      c.beginPath();
      c.moveTo(f.x - 5, f.y - 74);
      c.lineTo(f.x + 5, f.y - 74);
      c.lineTo(f.x, f.y - 66);
      c.fill();
    }
  }
  private drawDemo(c: CanvasRenderingContext2D, time: number) {
    const positions = [
      { x: 750, id: 'titan' as const, angle: 38 },
      { x: 1235, id: 'phantom' as const, angle: 145 },
      { x: 1040, id: 'viper' as const, angle: 120 },
    ];
    for (const p of positions) {
      const y = this.terrain!.surface(p.x) - 22;
      drawTank(c, p.x, y, 1.9, p.id, p.angle);
      if (p.id === 'titan') {
        c.strokeStyle = '#f8dfa788';
        c.setLineDash([3, 12]);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(p.x + 40, y - 50);
        c.quadraticCurveTo(1020, 100, 1235, this.terrain!.surface(1235) - 25);
        c.stroke();
        c.setLineDash([]);
        const t = (time / 6500) % 1,
          x = (1 - t) ** 2 * (p.x + 40) + 2 * (1 - t) * t * 1020 + t * t * 1235,
          py =
            (1 - t) ** 2 * (y - 50) +
            2 * (1 - t) * t * 100 +
            t * t * (this.terrain!.surface(1235) - 25);
        c.shadowColor = '#ffdd98';
        c.shadowBlur = 20;
        c.fillStyle = '#ffe1a0';
        c.beginPath();
        c.arc(x, py, 5, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
      }
    }
  }
  private drawShots(c: CanvasRenderingContext2D) {
    if (!this.shots.length) return;
    const elapsed = performance.now() - this.shotAt,
      t = Math.min(1, elapsed / 1600);
    if (t === 1 && !this.impactSound) {
      sound.explosion();
      this.impactSound = true;
      if (!document.body.classList.contains('reduce-motion')) this.cameras.main.shake(160, 0.003);
    }
    for (const [si, shot] of this.shots.entries()) {
      const progress = Math.min(1, Math.max(0, (elapsed - si * 80) / 1500)),
        index = Math.min(shot.path.length - 1, Math.floor(progress * (shot.path.length - 1)));
      if (progress < 1) {
        c.strokeStyle = shot.color + 'bb';
        c.lineWidth = 3;
        c.beginPath();
        for (let j = Math.max(0, index - 7); j <= index; j++) {
          const p = shot.path[j];
          j === Math.max(0, index - 7) ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y);
        }
        c.stroke();
        const p = shot.path[index];
        c.fillStyle = '#fff5d9';
        c.beginPath();
        c.arc(p.x, p.y, 5, 0, Math.PI * 2);
        c.fill();
      } else if (elapsed < 2700) {
        const fade = Math.max(0, 1 - (elapsed - 1500) / 1200),
          r = (1 - fade) * shot.radius * 1.4 + 15;
        c.globalAlpha = fade;
        c.strokeStyle = shot.color;
        c.lineWidth = 4;
        c.beginPath();
        c.arc(shot.impact.x, shot.impact.y, r, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4;
          c.fillStyle = i % 2 ? shot.color : '#fff0c6';
          c.fillRect(
            shot.impact.x + Math.cos(a) * r,
            shot.impact.y + Math.sin(a) * r - 20 * (1 - fade),
            5 * fade + 1,
            5 * fade + 1,
          );
        }
        c.font = 'bold 22px sans-serif';
        c.fillStyle = '#fff0d9';
        c.textAlign = 'center';
        for (const d of shot.damage) c.fillText('−' + d.amount, d.x, d.y - 65 - (1 - fade) * 35);
        c.globalAlpha = 1;
      }
    }
    if (elapsed > 2800) this.shots = [];
  }
}
export function mountArena(parent: string, onAim?: (angle: number) => void) {
  const scene = new BattleScene();
  scene.onAim = onAim;
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#263b48',
    scene: [scene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    audio: { noAudio: true },
    banner: false,
  });
  return { game, scene };
}
