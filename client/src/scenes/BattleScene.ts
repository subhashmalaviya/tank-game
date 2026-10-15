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
import { projectile } from '../../../shared/src/physics/projectile';
import type { MatchState, Fighter, Shot } from '../../../shared/src/types';
import { drawTank } from '../ui/art';
import { drawWeapon } from '../effects/weapons';
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
  private image!: Phaser.GameObjects.Image;
  private sounds = new Set<string>();
  private previewKey = '';
  private previewPoints: { x: number; y: number }[] = [];
  private pulses: { x: number; y: number; color: string; label: string; at: number }[] = [];
  private movement = new Map<string, { x: number; y: number; at: number }>();
  clockOffset = 0;
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
    this.image = this.add.image(0, 0, 'world').setOrigin(0);
    this.ground.width = WIDTH;
    this.ground.height = HEIGHT;
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
        if (old && (old.x !== f.x || old.y !== f.y))
          this.movement.set(f.id, { x: old.x, y: old.y, at: performance.now() });
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
    sound.map = state.map;
    if (!this.ctx) return;
    if (this.revision !== state.revision) {
      this.terrain = Terrain.unpack(state.terrain);
      this.paintGround();
      this.revision = state.revision;
    }
    const key = state.id + ':' + state.turn;
    if ((state.shots.length || state.phase === 'resolving') && key !== this.shotKey) {
      this.shotKey = key;
      this.shots = state.shots;
      this.shotAt =
        performance.now() -
        Math.max(0, Date.now() + this.clockOffset - (state.resolutionStartedAt ?? Date.now()));
      this.sounds.clear();
      if (state.abilityEvents?.length) sound.ability();
      this.impactSound = false;
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
    const vw = this.scale.width,
      vh = this.scale.height,
      scale = Math.min(vw / WIDTH, vh / HEIGHT),
      iw = WIDTH * scale,
      ih = HEIGHT * scale;
    this.image.setPosition((vw - iw) / 2, (vh - ih) / 2).setDisplaySize(iw, ih);
    const canvas = this.game.canvas;
    canvas.dataset.worldX = String((vw - iw) / 2);
    canvas.dataset.worldY = String((vh - ih) / 2);
    canvas.dataset.worldScale = String(scale);
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
    for (const z of this.state?.environment?.gravityZones ?? []) {
      c.fillStyle = '#b7a4ff12';
      c.fillRect(z.from, 0, z.to - z.from, HEIGHT);
      c.strokeStyle = '#b7a4ff55';
      c.setLineDash([4, 9]);
      c.strokeRect(z.from, 0, z.to - z.from, HEIGHT);
      c.setLineDash([]);
      c.fillStyle = '#e3d9ff';
      c.font = '12px sans-serif';
      c.fillText(z.multiplier + '× GRAVITY', z.from + 20, 260);
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
        c.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        c.fill();
        for (let i = 0; i < 6; i++) {
          c.fillStyle = h.kind === 'toxic' ? '#d4f68d88' : '#ffd39688';
          const x = h.x + Math.sin(i * 4) * h.radius * 0.8;
          c.fillRect(x, h.y - ((time / 40 + i * 13) % 30), 3, 5);
        }
      }
      for (const cover of this.state.environment?.cover ?? []) {
        if (!cover.hp) continue;
        c.globalAlpha = cover.active ? 1 : 0.22;
        c.fillStyle = {
          stone: '#637078',
          wood: '#786c48',
          ice: '#9fd9ec',
          metal: '#354d68',
          barrel: '#c37f4c',
          barrier: '#9e89ff',
        }[cover.material];
        c.fillRect(cover.x - cover.width / 2, cover.y, cover.width, cover.height);
        c.strokeStyle = '#d6efff88';
        c.strokeRect(cover.x - cover.width / 2, cover.y, cover.width, cover.height);
        c.fillStyle = '#d8f0ff';
        c.fillRect(
          cover.x - cover.width / 2,
          cover.y - 5,
          (cover.width * cover.hp) / cover.maxHp,
          2,
        );
        c.globalAlpha = 1;
      }
      for (const f of this.state.fighters) this.tank(c, f, time);
      const a = this.state.fighters.find((f) => f.id === this.playerId);
      if (
        a &&
        a.hp > 0 &&
        (this.state.phase === 'planning' || this.state.activeId === a.id) &&
        !this.state.resolveAt
      ) {
        c.fillStyle = '#fff9';
        const key = [this.state.revision, this.angle, this.power, this.weapon].join(':');
        if (key !== this.previewKey) {
          this.previewKey = key;
          this.previewPoints = projectile(
            a,
            this.angle,
            this.power,
            WEAPONS[this.weapon] ?? WEAPONS.standard,
            theme.gravity,
            this.terrain,
            this.state.fighters,
            this.playerId,
            this.state.config.mode === 'teams',
            this.state.environment,
          ).path.filter((_, i) => i % 3 === 0);
        }
        const points = this.previewPoints;
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
    const abilityAge = performance.now() - this.shotAt;
    if (this.state?.phase === 'resolving' && abilityAge < 1500)
      for (const event of this.state.abilityEvents ?? []) {
        const t = abilityAge / 1500,
          r = 35 + t * 150;
        c.save();
        c.globalAlpha = 1 - t;
        c.strokeStyle = TANKS[event.tank].color;
        c.fillStyle = TANKS[event.tank].color + '44';
        c.lineWidth = 3;
        if (event.tank === 'titan') {
          for (let i = 0; i < 5; i++)
            c.strokeRect(event.x - 40 + i * 16, event.y - 35 - t * 10, 14, 35);
        } else if (event.tank === 'phantom') {
          for (let i = 1; i < 4; i++) {
            c.globalAlpha = ((1 - t) * 0.4) / i;
            drawTank(c, event.x - i * 18, event.y - i * 3, 1, event.tank);
          }
        } else if (event.tank === 'viper') {
          c.beginPath();
          c.arc(event.x, event.y - 50, 30 + t * 12, 0, 7);
          c.stroke();
          c.beginPath();
          c.moveTo(event.x - 45, event.y - 50);
          c.lineTo(event.x + 45, event.y - 50);
          c.moveTo(event.x, event.y - 95);
          c.lineTo(event.x, event.y - 5);
          c.stroke();
        } else if (event.tank === 'quake') {
          c.beginPath();
          c.moveTo(event.x, event.y + 20);
          for (let i = 1; i < 9; i++)
            c.lineTo(event.x + i * 18, event.y + 20 + Math.sin(i * 7) * 10 * t);
          c.stroke();
        } else {
          c.beginPath();
          c.ellipse(
            event.x,
            event.y,
            r,
            event.tank === 'bastion' ? r : r * 0.4,
            0,
            event.tank === 'bastion' ? Math.PI : 0,
            Math.PI * 2,
          );
          c.stroke();
          if (event.tank === 'medic') {
            c.fillRect(event.x - 5, event.y - 60, 10, 30);
            c.fillRect(event.x - 15, event.y - 50, 30, 10);
          }
        }
        c.globalAlpha = 1 - t;
        c.font = 'bold 12px sans-serif';
        c.textAlign = 'center';
        c.fillStyle = '#effaff';
        c.fillText(event.label, event.x, event.y - 95 - t * 20);
        c.restore();
      }
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
    const active =
        f.id === this.state?.activeId ||
        (f.id === this.playerId && this.state?.phase === 'planning'),
      own = f.id === this.playerId;
    c.save();
    const motion = this.movement.get(f.id),
      blend = motion ? Math.min(1, (performance.now() - motion.at) / 110) : 1;
    if (motion) c.translate((motion.x - f.x) * (1 - blend), (motion.y - f.y) * (1 - blend));
    if (f.hp <= 0) c.globalAlpha = 0.3;
    if (f.statuses.cloak || f.statuses.phase) c.globalAlpha = 0.4;
    const elapsed = performance.now() - this.shotAt;
    const launching = this.shots.find(
      (s) =>
        s.owner === f.id && elapsed >= (s.launchMs ?? 180) && elapsed < (s.launchMs ?? 180) + 180,
    );
    const recoil =
      launching && !document.body.classList.contains('reduce-motion')
        ? Math.sin(((elapsed - (launching.launchMs ?? 180)) / 180) * Math.PI) *
          (launching.weapon === 'heavy' ? 7 : 3)
        : 0;
    drawTank(
      c,
      f.x - Math.sign(Math.cos((f.angle * Math.PI) / 180)) * recoil,
      f.y,
      1,
      f.tank,
      own && active ? this.angle : f.angle,
      blend < 1 ? time : 0,
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
    if (f.statuses.emp) {
      c.fillStyle = '#8deaff';
      c.font = 'bold 15px sans-serif';
      c.fillText('ϟ EMP ' + f.statuses.emp + 'R', f.x, f.y - 80);
    }
    if (f.statuses.shield) {
      c.fillStyle = '#bddfff';
      c.font = '11px sans-serif';
      c.fillText('SHIELD ' + f.statuses.shield, f.x, f.y + 40);
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
    const elapsed = performance.now() - this.shotAt;
    for (const [i, s] of this.shots.entries()) {
      for (const [stage, at] of [
        ['launch', s.launchMs ?? 180],
        ['impact', s.impactMs ?? 1700],
      ] as const) {
        const key = i + stage;
        if (elapsed >= at && !this.sounds.has(key)) {
          this.sounds.add(key);
          if (stage === 'impact' && s.hit !== false && s.terrainRadius && this.terrain) {
            this.terrain.crater(s.impact.x, s.impact.y, s.terrainRadius);
            this.paintGround();
          }
          if (stage === 'launch' || s.hit !== false) sound.weapon(s.weapon, stage === 'impact');
          if (
            stage === 'impact' &&
            s.hit !== false &&
            !document.body.classList.contains('reduce-motion')
          )
            this.cameras.main.shake(110, Math.min(0.003, s.radius / 30000));
        }
      }
      drawWeapon(c, s, elapsed);
    }
    if (this.shots.length && elapsed > Math.max(...this.shots.map((s) => s.impactMs ?? 1700)) + 800)
      this.shots = [];
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
    transparent: true,
    scene: [scene],
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    audio: { noAudio: true },
    banner: false,
  });
  return { game, scene };
}
