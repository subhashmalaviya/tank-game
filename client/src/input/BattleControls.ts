import type { Command, MatchState } from '../../../shared/src/types';
import { TANKS } from '../../../shared/src/configs/tanks';
import { WEAPONS } from '../../../shared/src/configs/weapons';
import { tankArt } from '../ui/art';
import { fightersAtImpact } from '../effects/combatFeedback';
import { sound } from '../audio/sound';
const glyph: Record<string, string> = {
  standard: '◆',
  heavy: '⬢',
  shadow: '⟋',
  cluster: '⋮',
  piercing: '↯',
  bouncing: '↝',
  guided: '➶',
  electric: 'ϟ',
  incendiary: '♨',
  ice: '❄',
  seismic: '⌁',
  plasma: '≋',
  charged: '◉',
};
const safe = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export class BattleControls {
  private state?: MatchState;
  private abort = new AbortController();
  private frame = 0;
  private last = 0;
  private move = 0;
  private movePending = false;
  private moveTime = 0;
  private keys = new Set<string>();
  private round = '';
  private pending = false;
  private inventory = '';
  private connected = true;
  private lastAllowed = false;
  private clockOffset = 0;
  private healthAt = 0;
  angle = 45;
  power = 65;
  weapon = 'standard';
  ability = false;
  constructor(
    private root: HTMLElement,
    private id: string,
    private send: (c: Command) => Promise<void>,
    private aim: (a: number, p: number, w: string) => void,
    private error: (s: string) => void,
    private settings: () => void,
  ) {
    root.innerHTML = `<div class="hud-own glass-panel" id="pilot-hud"></div><div class="hud-round glass-panel"><small id="turn-label">ROUND 1</small><b id="turn-time">30</b><span id="phase-label">PLANNING</span></div><div class="hud-rivals glass-panel"><div id="rival-hud"></div><button id="battle-settings" aria-label="Battle settings">⚙</button></div><div id="combat-message" aria-live="polite"></div><div class="move-overlay"><div class="joystick" id="move-stick" role="slider" aria-label="Movement joystick" tabindex="0"><span>↔</span><i></i></div><small id="fuel"></small></div><div class="aim-overlay"><div class="joystick" id="aim-stick" role="slider" aria-label="Cannon aiming joystick" tabindex="0"><span>⌖</span><i></i></div><small id="angle-value"></small></div><label class="power-overlay glass-panel"><b id="power-value">65%</b><input aria-label="Shot power" id="battle-power" type="range" min="10" max="100" value="65"><small>POWER</small></label><div class="arsenal-overlay glass-panel"><div class="arsenal-row"><div id="weapon-grid"></div><button id="ability-toggle" class="special" aria-label="Plan special ability">⬡</button></div><div class="arsenal-actions"><button id="expand-inventory" aria-expanded="false" aria-label="Expand weapon inventory">＋</button><button id="lock-shot">LOCK IN SHOT ↗</button></div><small id="loadout-label"></small><select id="repair-target" aria-label="Repair target" hidden></select></div><div class="battle-help">A / D MOVE · DRAG AIM · WHEEL POWER · E ABILITY · SPACE LOCK</div><div class="rotate-hint">↻ Landscape gives you a wider view</div>`;
    const on = (el: EventTarget, type: string, fn: EventListener) =>
      el.addEventListener(type, fn, { signal: this.abort.signal });
    on(root.querySelector('#battle-settings')!, 'click', () => settings());
    on(root.querySelector('#lock-shot')!, 'click', () => void this.lock());
    on(root.querySelector('#ability-toggle')!, 'click', () => this.toggleAbility());
    on(root.querySelector('#expand-inventory')!, 'click', () => {
      root.classList.toggle('inventory-open');
      root
        .querySelector('#expand-inventory')!
        .setAttribute('aria-expanded', String(root.classList.contains('inventory-open')));
    });
    on(root.querySelector('#battle-power')!, 'input', (e) => {
      if (this.allowed()) {
        this.power = Number((e.target as HTMLInputElement).value);
        this.sync();
      }
    });
    on(root.querySelector('#weapon-grid')!, 'click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-weapon]');
      if (b && !b.disabled && this.allowed()) {
        this.weapon = b.dataset.weapon!;
        this.sync();
      }
    });
    this.stick('move-stick', (x) => {
      this.move = Math.abs(x) > 0.15 ? x : 0;
    });
    this.stick('aim-stick', (x, y) => {
      if (Math.hypot(x, y) > 0.18) {
        this.angle = Math.max(5, Math.min(175, (Math.atan2(-y, x) * 180) / Math.PI));
        this.sync();
      }
    });
    on(window, 'keydown', (e) => {
      const k = e as KeyboardEvent;
      if (k.key === 'Escape') {
        k.preventDefault();
        settings();
        return;
      }
      if (
        (k.target as HTMLElement).matches('input,select,textarea') ||
        document.querySelector('.modal-backdrop')
      )
        return;
      if (!this.allowed()) return;
      const key = k.key.toLowerCase();
      if (['a', 'd', 'arrowleft', 'arrowright', ' ', 'e', 'w', 's'].includes(key))
        k.preventDefault();
      this.keys.add(key);
      if (k.repeat) return;
      if (key === ' ') void this.lock();
      if (key === 'e') this.toggleAbility();
      const n = Number(key) - 1;
      if (n >= 0 && n < 9) {
        const b = root.querySelectorAll<HTMLButtonElement>('[data-weapon]')[n];
        if (b && !b.disabled) {
          this.weapon = b.dataset.weapon!;
          this.sync();
        }
      }
    });
    on(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).key.toLowerCase()));
    on(window, 'blur', () => {
      this.keys.clear();
      this.move = 0;
    });
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }
  bindCanvas(canvas: HTMLCanvasElement) {
    if (canvas.dataset.inputBound) return;
    canvas.dataset.inputBound = 'true';
    let dragging = false;
    const aim = (e: PointerEvent) => {
      if (!this.allowed()) return;
      const f = this.state!.fighters.find((f) => f.id === this.id)!;
      const r = canvas.getBoundingClientRect(),
        x =
          (e.clientX - r.left - Number(canvas.dataset.worldX ?? 0)) /
          Number(canvas.dataset.worldScale ?? 1),
        y =
          (e.clientY - r.top - Number(canvas.dataset.worldY ?? 0)) /
          Number(canvas.dataset.worldScale ?? 1);
      this.angle = Math.max(5, Math.min(175, (Math.atan2(f.y - y, x - f.x) * 180) / Math.PI));
      this.sync();
    };
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.allowed()) return;
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        aim(e);
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (dragging) aim(e);
      },
      { signal: this.abort.signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      canvas.addEventListener(type, () => (dragging = false), { signal: this.abort.signal });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.allowed()) {
          this.power = Math.max(10, Math.min(100, this.power - Math.sign(e.deltaY) * 2));
          this.sync();
        }
      },
      { passive: false, signal: this.abort.signal },
    );
  }
  private stick(id: string, change: (x: number, y: number) => void) {
    const el = this.root.querySelector<HTMLElement>('#' + id)!;
    let pointer = -1;
    const update = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(),
        x = (e.clientX - r.left - r.width / 2) / (r.width / 2),
        y = (e.clientY - r.top - r.height / 2) / (r.height / 2),
        m = Math.max(1, Math.hypot(x, y));
      change(x / m, y / m);
      el.querySelector<HTMLElement>('i')!.style.transform =
        `translate(${(x / m) * 25}px,${(y / m) * 25}px)`;
    };
    el.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.allowed() || pointer !== -1) return;
        pointer = e.pointerId;
        el.setPointerCapture(pointer);
        update(e);
      },
      { signal: this.abort.signal },
    );
    el.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId === pointer && this.allowed()) update(e);
      },
      { signal: this.abort.signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      el.addEventListener(
        type,
        () => {
          pointer = -1;
          change(0, 0);
          el.querySelector<HTMLElement>('i')!.style.transform = '';
        },
        { signal: this.abort.signal },
      );
  }
  private allowed() {
    const s = this.state,
      f = s?.fighters.find((f) => f.id === this.id);
    return !!(
      this.connected &&
      s &&
      f &&
      f.hp > 0 &&
      !s.result &&
      !s.resolveAt &&
      !this.pending &&
      !s.readyIds?.includes(this.id) &&
      (s.phase === 'planning' || s.activeId === this.id) &&
      !document.querySelector('.modal-backdrop')
    );
  }
  private async execute(c: Command) {
    try {
      sound.unlock();
      await this.send(c);
    } catch (e) {
      if (c.type === 'move') {
        this.move = 0;
        this.keys.clear();
      }
      this.error((e as Error).message);
    }
  }
  private async lock() {
    if (!this.allowed()) return;
    this.pending = true;
    this.refresh();
    await this.execute(
      this.state!.phase
        ? {
            type: 'lock',
            round: this.state!.turn,
            angle: this.angle,
            power: this.power,
            weapon: this.weapon,
            ability: this.ability,
            ...(this.root.querySelector<HTMLSelectElement>('#repair-target')!.value
              ? { targetId: this.root.querySelector<HTMLSelectElement>('#repair-target')!.value }
              : {}),
          }
        : { type: 'fire', angle: this.angle, power: this.power, weapon: this.weapon },
    );
    this.pending = false;
    this.refresh();
  }
  private toggleAbility() {
    if (!this.allowed()) return;
    const f = this.state!.fighters.find((f) => f.id === this.id)!;
    if (f.cooldown || f.statuses.emp || f.energy < TANKS[f.tank].ability.cost) return;
    if (!this.state!.phase) {
      const targetId = this.root.querySelector<HTMLSelectElement>('#repair-target')!.value;
      void this.execute({ type: 'ability', ...(targetId ? { targetId } : {}) });
      return;
    }
    this.ability = !this.ability;
    this.sync();
  }
  update(s: MatchState, connected: boolean, clockOffset = 0) {
    this.clockOffset = clockOffset;
    this.state = s;
    this.connected = connected;
    const visibleFighters = fightersAtImpact(
      s,
      Date.now() + this.clockOffset - (s.resolutionStartedAt ?? Date.now()),
    );
    const me = visibleFighters.find((f) => f.id === this.id);
    if (!me) return;
    const key = s.id + ':' + s.turn;
    if (key !== this.round) {
      this.round = key;
      this.angle = me.x < 720 ? 45 : 135;
      this.power = 65;
      this.weapon = TANKS[me.tank].weapon;
      this.ability = false;
      if (me.weapons[this.weapon]?.cooldown) this.weapon = 'standard';
    }
    if (s.ownPlan) {
      this.angle = s.ownPlan.angle;
      this.power = s.ownPlan.power;
      this.weapon = s.ownPlan.weapon;
      this.ability = s.ownPlan.ability;
    }
    this.root.querySelector('#pilot-hud')!.innerHTML =
      `<img src="${tankArt(me.tank)}" alt="${TANKS[me.tank].name}"><div><b>${safe(me.name)}</b><small>${TANKS[me.tank].name} · <span data-health-id="${me.id}">${me.hp}/${me.maxHp} HP</span></small><meter data-meter-id="${me.id}" min="0" max="${me.maxHp}" value="${me.hp}"></meter><small>ϟ ${me.energy} · ${me.cooldown ? 'ABILITY ' + me.cooldown + 'R' : TANKS[me.tank].ability.name} ${Object.entries(
        me.statuses,
      )
        .filter(([k]) => k !== 'shieldTurns')
        .map(([k, v]) => safe(k.toUpperCase()) + ' ' + v)
        .join(' · ')}</small></div>`;
    this.root.querySelector('#rival-hud')!.innerHTML = visibleFighters
      .filter((f) => f.id !== this.id)
      .map(
        (f) =>
          `<div><b>${safe(f.name)} ${s.config.mode === 'teams' ? '· T' + (f.team + 1) : ''}</b><small><span data-health-id="${f.id}">${f.hp}/${f.maxHp} HP</span> · ${f.hp <= 0 ? 'OUT' : !f.connected ? 'OFFLINE' : s.readyIds?.includes(f.id) ? '✓ READY' : 'PREPARING'}</small><meter data-meter-id="${f.id}" min="0" max="${f.maxHp}" value="${f.hp}"></meter></div>`,
      )
      .join('');
    this.root.querySelector('#turn-label')!.textContent = (s.phase ? 'ROUND ' : 'TURN ') + s.turn;
    this.root.querySelector('#phase-label')!.textContent = s.resolveAt
      ? 'RESOLVING'
      : s.phase
        ? 'PLANNING'
        : s.activeId === this.id
          ? 'YOUR TURN'
          : (s.fighters.find((f) => f.id === s.activeId)?.name ?? 'RIVAL') + ' TURN';
    this.root.querySelector('#fuel')!.textContent =
      Math.max(0, Math.floor(TANKS[me.tank].mobility * (me.statuses.freeze ? 0.3 : 1) - me.moved)) +
      'm MOVE';
    const inv = JSON.stringify(me.weapons);
    if (inv !== this.inventory) {
      this.inventory = inv;
      this.root.querySelector('#weapon-grid')!.innerHTML = Object.entries(me.weapons)
        .map(
          ([id, v], i) =>
            `<button data-weapon="${id}" title="${safe(WEAPONS[id].name)} · ${WEAPONS[id].damage} damage" aria-label="${safe(WEAPONS[id].name)}" style="--weapon:${WEAPONS[id].color}" ${v.cooldown || v.ammo === 0 ? 'disabled' : ''}><span>${glyph[id] ?? '◆'}</span><small>${v.cooldown ? v.cooldown + 'R' : v.ammo < 0 ? '∞' : v.ammo}</small><sup>${i + 1}</sup></button>`,
        )
        .join('');
    }
    const target = this.root.querySelector<HTMLSelectElement>('#repair-target')!;
    target.hidden = me.tank !== 'medic' || s.config.mode !== 'teams';
    if (!target.hidden) {
      const value = target.value;
      target.innerHTML = s.fighters
        .filter((f) => f.hp > 0 && f.team === me.team)
        .map((f) => `<option value="${f.id}">${safe(f.name)} · ${f.hp} HP</option>`)
        .join('');
      if ([...target.options].some((o) => o.value === value)) target.value = value;
    }
    this.refresh();
    this.sync();
  }
  private refresh() {
    if (!this.state) return;
    const s = this.state,
      me = s.fighters.find((f) => f.id === this.id)!;
    const can = this.allowed(),
      lock = this.root.querySelector<HTMLButtonElement>('#lock-shot')!;
    lock.disabled = !can;
    lock.textContent = s.resolveAt
      ? 'SHOTS IN FLIGHT'
      : s.readyIds?.includes(this.id)
        ? '✓ LOCKED · WAITING'
        : this.pending
          ? 'SEALING…'
          : s.phase
            ? 'LOCK IN SHOT ↗'
            : 'FIRE ↗';
    this.root.classList.toggle('locked', !can);
    this.root.querySelector<HTMLButtonElement>('#ability-toggle')!.disabled =
      !can || !!me.cooldown || !!me.statuses.emp || me.energy < TANKS[me.tank].ability.cost;
    this.root.querySelector<HTMLButtonElement>('#ability-toggle')!.title =
      TANKS[me.tank].ability.description;
    this.root.querySelector<HTMLInputElement>('#battle-power')!.disabled = !can;
    this.root.querySelector('#combat-message')!.textContent = !this.connected
      ? 'RECONNECTING — INPUT PAUSED'
      : s.resolveAt
        ? 'SEALED PLANS REVEALED'
        : s.readyIds?.includes(this.id)
          ? 'YOUR PLAN IS SEALED'
          : s.environment?.wind
            ? 'WIND ' +
              (s.environment.wind > 0 ? '→ ' : '← ') +
              Math.abs(s.environment.wind).toFixed(0) +
              ' · YOUR AIM IS PRIVATE'
            : 'YOUR AIM IS PRIVATE';
  }
  private sync() {
    this.root.querySelector('#angle-value')!.textContent = Math.round(this.angle) + '° AIM';
    this.root.querySelector('#power-value')!.textContent = Math.round(this.power) + '%';
    this.root.querySelector<HTMLInputElement>('#battle-power')!.value = String(this.power);
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-weapon]')) {
      b.classList.toggle('selected', b.dataset.weapon === this.weapon);
      b.setAttribute('aria-pressed', String(b.dataset.weapon === this.weapon));
    }
    this.root.querySelector('#ability-toggle')!.classList.toggle('selected', this.ability);
    this.root.querySelector('#ability-toggle')!.setAttribute('aria-pressed', String(this.ability));
    this.root.querySelector('#loadout-label')!.textContent =
      WEAPONS[this.weapon].name + (this.ability ? ' + SPECIAL QUEUED' : '');
    this.aim(this.angle, this.power, this.weapon);
  }
  private tick(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    if (this.state && t - this.healthAt >= 50) {
      this.healthAt = t;
      const fighters = fightersAtImpact(
        this.state,
        Date.now() + this.clockOffset - (this.state.resolutionStartedAt ?? Date.now()),
      );
      for (const el of this.root.querySelectorAll<HTMLElement>('[data-health-id]')) {
        const f = fighters.find((f) => f.id === el.dataset.healthId);
        if (f)
          el.textContent =
            f.hp +
            '/' +
            f.maxHp +
            ' HP' +
            (f.statuses.shield ? ' · SHIELD ' + f.statuses.shield : '');
      }
      for (const meter of this.root.querySelectorAll<HTMLMeterElement>('[data-meter-id]')) {
        const f = fighters.find((f) => f.id === meter.dataset.meterId);
        if (f) meter.value = f.hp;
      }
    }
    const allowed = this.allowed();
    if (allowed !== this.lastAllowed) {
      this.lastAllowed = allowed;
      this.refresh();
    }
    if (allowed) {
      const direction =
        this.move ||
        (this.keys.has('a') || this.keys.has('arrowleft')
          ? -1
          : this.keys.has('d') || this.keys.has('arrowright')
            ? 1
            : 0);
      this.moveTime += dt;
      if (direction && this.moveTime >= 0.1 && !this.movePending) {
        const f = this.state!.fighters.find((f) => f.id === this.id)!;
        if (f.moved < TANKS[f.tank].mobility * (f.statuses.freeze ? 0.3 : 1)) {
          this.movePending = true;
          void this.execute({
            type: 'move',
            direction: direction < 0 ? -1 : 1,
            distance: Math.min(8, Math.max(1, Math.abs(direction) * 60 * this.moveTime)),
          }).finally(() => (this.movePending = false));
          sound.move();
        }
        this.moveTime = 0;
      }
      if (!direction) this.moveTime = 0;
      if (this.keys.has('w') || this.keys.has('s')) {
        this.power = Math.max(
          10,
          Math.min(100, this.power + (this.keys.has('w') ? 1 : -1) * dt * 30),
        );
        this.sync();
      }
    } else {
      this.move = 0;
      this.keys.clear();
    }
    this.frame = requestAnimationFrame((v) => this.tick(v));
  }
  destroy() {
    this.abort.abort();
    cancelAnimationFrame(this.frame);
  }
}
