import { validateSuper, resolveSupers } from './superpowers';
import { Game } from './engine';
import { commandSchema } from '../../../shared/src/configs/match';
import { TANKS } from '../../../shared/src/configs/tanks';
import { WEAPONS } from '../../../shared/src/configs/weapons';
import { ABILITIES, enemy } from '../../../shared/src/abilities/abilities';
import { projectile } from '../../../shared/src/physics/projectile';
import { Terrain } from '../../../shared/src/maps/terrain';
import { mapById } from '../../../shared/src/configs/maps';
import {
  coverAt,
  coverDamage,
  environmentRound,
  generateEnvironment,
} from '../../../shared/src/maps/environment';
import type {
  Command,
  Fighter,
  LobbyPlayer,
  MatchConfig,
  MatchState,
  Plan,
  Shot,
} from '../../../shared/src/types';
interface Damage {
  target: string;
  source?: string;
  raw: number;
  pierce?: boolean;
  shot?: Shot;
}
/** Plans never enter state. Only snapshot(viewer) can return a pilot's own sealed plan. */
export class RoundGame extends Game {
  private plans = new Map<string, Plan>();
  private outcome: MatchState | null = null;
  private botDeadline: number;
  constructor(players: LobbyPlayer[], config: MatchConfig, seed: number, now = Date.now()) {
    super(players, config, seed, now);
    this.state.phase = 'planning';
    this.state.activeId = '';
    this.state.readyIds = [];
    this.state.abilityEvents = [];
    this.state.environment = generateEnvironment(
      seed,
      this.state.map,
      this.terrain,
      this.state.fighters,
    );
    this.state.message = 'Plan your attack. Enemy choices remain sealed.';
    this.botDeadline = now + 1600;
  }
  private pilot(id: string) {
    const p = this.state.fighters.find((f) => f.id === id);
    if (!p) throw new Error('Not a pilot in this match.');
    return p;
  }
  private validate(a: Fighter, p: Plan) {
    if (p.round !== this.state.turn) throw new Error('This plan belongs to a different round.');
    validateSuper(a, p, this.state, this.terrain);
    if (p.pass) return;
    const inv = a.weapons[p.weapon];
    if (!Object.hasOwn(WEAPONS, p.weapon) || !Object.hasOwn(a.weapons, p.weapon) || !inv)
      throw new Error('Weapon is not equipped.');
    if (inv.ammo === 0) throw new Error('No ammunition left.');
    if (inv.cooldown) throw new Error('Weapon is cooling down.');
    if (p.ability) {
      const d = TANKS[a.tank];
      if (a.statuses.emp) throw new Error('Abilities disabled by EMP.');
      if (a.cooldown) throw new Error('Ability is cooling down.');
      if (a.energy < d.ability.cost) throw new Error('Not enough energy.');
      // Validate target/range without changing any authoritative public resource or status.
      const fs = structuredClone(this.state.fighters),
        actor = fs.find((f) => f.id === a.id)!;
      ABILITIES[a.tank].apply({
        actor,
        fighters: fs,
        teamMode: this.state.config.mode === 'teams',
        hazards: [],
        targetId: p.targetId,
        damage: () => {},
        crater: () => {},
      });
    }
  }
  override action(id: string, input: Command, now = Date.now()) {
    const cmd = commandSchema.parse(input),
      a = this.pilot(id);
    if (this.state.result) throw new Error('Match has ended.');
    if (this.state.phase !== 'planning') throw new Error('Round is resolving.');
    if (a.hp <= 0) throw new Error('Tank is eliminated.');
    if (!a.connected && !a.bot) throw new Error('Pilot is disconnected.');
    if (now >= this.state.deadline) throw new Error('Planning timer expired.');
    if (this.plans.has(id)) throw new Error('Your plan is locked for this round.');
    if (cmd.type === 'move') {
      for (let d = 0; d <= cmd.distance; d += 2)
        if (coverAt(this.state.environment, a.x + cmd.direction * (d + 20), a.y))
          throw new Error('Cover blocks movement.');
      this.state.activeId = id;
      try {
        super.action(id, cmd, now);
      } finally {
        this.state.activeId = '';
      }
      return;
    }
    if (cmd.type !== 'lock' && cmd.type !== 'pass')
      throw new Error('Prepare your attack, then lock in your shot.');
    const plan: Plan =
      cmd.type === 'pass'
        ? {
            round: this.state.turn,
            angle: 90,
            power: 10,
            weapon: 'standard',
            ability: false,
            pass: true,
          }
        : (({ type, ...p }) => p)(cmd);
    this.validate(a, plan);
    this.plans.set(id, { ...plan });
    this.state.readyIds = [...this.plans.keys()];
    this.state.message = 'A pilot is ready.';
    this.state.revision++;
    if (this.allReady()) this.resolve(now);
  }
  private allReady() {
    return this.state.fighters.filter((f) => f.hp > 0).every((f) => this.plans.has(f.id));
  }
  snapshot(viewerId?: string) {
    const state = structuredClone(this.state);
    if (viewerId && this.plans.has(viewerId)) state.ownPlan = { ...this.plans.get(viewerId)! };
    // Unrevealed fields are omitted even on reconnect and even for allies.
    for (const f of state.fighters)
      if (f.id !== viewerId && state.phase === 'planning') {
        f.angle = 90;
        f.power = 0;
        f.weapons = {};
      }
    return state;
  }
  private resolve(now: number) {
    const publicState = this.state,
      work = structuredClone(publicState),
      damage: Damage[] = [],
      eligible = work.fighters.filter((f) => f.hp > 0).map((f) => f.id),
      priorStatuses = new Map(work.fighters.map((f) => [f.id, { ...f.statuses }]));
    this.state = work;
    work.shots = [];
    work.abilityEvents = [];
    // All accepted abilities activate together. A new EMP cannot retroactively cancel a sealed ability.
    for (const id of [...eligible].sort()) {
      const a = this.pilot(id),
        p = this.plans.get(id)!;
      if (!p?.ability || p.pass) continue;
      try {
        ABILITIES[a.tank].apply({
          actor: a,
          fighters: work.fighters,
          teamMode: work.config.mode === 'teams',
          hazards: work.hazards,
          targetId: p.targetId,
          damage: (t, n) => damage.push({ target: t.id, source: id, raw: n }),
          crater: (x, y, r) => this.terrain.crater(x, y, r),
        });
      } catch {
        work.abilityEvents.push({
          owner: id,
          tank: a.tank,
          x: a.x,
          y: a.y,
          label: 'Ability fizzled: target no longer eligible',
        });
        continue;
      }
      a.energy -= TANKS[a.tank].ability.cost;
      a.cooldown = TANKS[a.tank].ability.cooldown + 1;
      work.abilityEvents.push({
        owner: id,
        tank: a.tank,
        x: a.x,
        y: a.y,
        targetId: p.targetId,
        label: TANKS[a.tank].ability.name,
      });
    }
    const reflectionShields = resolveSupers(work, this.terrain, this.plans, damage);
    work.resolutionStart = work.fighters.map((f) => ({
      id: f.id,
      hp: f.hp,
      shield: f.statuses.shield ?? 0,
    }));
    const frozenTerrain = new Terrain(this.terrain.data.slice()),
      frozenFighters = structuredClone(work.fighters),
      frozenEnvironment = structuredClone(work.environment!);
    for (const id of eligible) {
      const a = this.pilot(id),
        p = this.plans.get(id)!;
      if (!p || p.pass) continue;
      let w = { ...WEAPONS[p.weapon] };
      const boost = !!a.statuses.overcharge;
      if (a.tank === 'viper' && a.statuses.hunter) {
        w.behavior = 'guided';
        w.projectiles = 5;
      }
      const count = w.projectiles,
        mult = a.tank === 'nova' && boost ? 1.65 : 1;
      delete a.statuses.overcharge;
      delete a.statuses.hunter;
      delete a.statuses.cloak;
      a.weapons[w.id].cooldown = w.cooldown + 1;
      if (a.weapons[w.id].ammo > 0) a.weapons[w.id].ammo--;
      a.stats.shots++;
      a.angle = p.angle;
      a.power = p.power;
      for (let i = 0; i < count; i++) {
        const flight = projectile(
          a,
          p.angle + (i - (count - 1) / 2) * (w.id === 'plasma' ? 1 : 4),
          p.power,
          w,
          mapById(work.map).gravity,
          frozenTerrain,
          frozenFighters,
          id,
          work.config.mode === 'teams',
          frozenEnvironment,
          reflectionShields,
        );
        const launchMs = (w.chargeMs ?? 180) + i * (w.launchGapMs ?? 110),
          shot: Shot = {
            id: `${work.id}:${work.turn}:${id}:${i}`,
            round: work.turn,
            weapon: w.id,
            owner: id,
            path: flight.path,
            reflections: flight.reflections,
            impact: flight.impact,
            hit: flight.hit,
            launchMs,
            impactMs: launchMs + flight.durationMs,
            radius: flight.hit ? w.radius : 0,
            terrainRadius: w.terrain * (work.map === 'desert' ? 1.2 : 1),
            color: w.color,
            damage: [],
          };
        work.shots.push(shot);
        if (!flight.hit) continue;
        const source = flight.reflectedBy ? this.pilot(flight.reflectedBy) : a;
        const directTargets = new Set<string>();
        for (const t of frozenFighters) {
          const distance = Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y),
            direct = t.id === flight.directId;
          if (t.hp <= 0 || !this.canDamage(source, t) || (!direct && distance > w.radius + 14))
            continue;
          damage.push({
            target: t.id,
            source: source.id,
            raw:
              (w.damage * Math.max(0.15, 1 - distance / (w.radius + 18)) +
                (direct ? w.direct : 0)) *
              TANKS[a.tank].damage *
              mult *
              work.config.damageMultiplier,
            pierce: w.behavior === 'pierce',
            shot,
          });
          directTargets.add(t.id);
          if (w.status) this.pilot(t.id).statuses[w.status] = 2;
          const live = this.pilot(t.id);
          if (t.id !== id)
            live.x = Math.max(
              22,
              Math.min(
                1418,
                live.x +
                  Math.sign(t.x - flight.impact.x) *
                    Math.min(w.id === 'heavy' ? 24 : 12, w.radius / 4),
              ),
            );
        }
        if (w.behavior === 'chain')
          for (const t of frozenFighters
            .filter(
              (t) =>
                enemy(source, t, work.config.mode === 'teams' && !work.config.friendlyFire) &&
                !directTargets.has(t.id) &&
                Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y) < 180,
            )
            .slice(0, 2)) {
            damage.push({
              target: t.id,
              source: source.id,
              raw: w.damage * 0.55 * work.config.damageMultiplier,
              shot,
            });
            this.pilot(t.id).statuses.emp = 2;
          }
        if (w.status === 'burn')
          work.hazards.push({
            x: flight.impact.x,
            y: flight.impact.y,
            radius: w.radius,
            kind: 'fire',
            turns: 3,
            owner: source.id,
          });
        for (const c of work.environment!.cover) {
          if (
            c.hp <= 0 ||
            Math.hypot(c.x - flight.impact.x, c.y + c.height / 2 - flight.impact.y) >
              w.radius + c.width
          )
            continue;
          c.hp = Math.max(0, c.hp - coverDamage(c.material, w));
          if (!c.hp && c.material === 'barrel') {
            this.terrain.crater(c.x, c.y + c.height, 65);
            work.shots.push({
              id: shot.id + ':barrel:' + c.id,
              round: work.turn,
              owner: id,
              weapon: 'heavy',
              path: [{ x: c.x, y: c.y + c.height / 2 }],
              impact: { x: c.x, y: c.y + c.height / 2 },
              launchMs: shot.impactMs,
              impactMs: shot.impactMs! + 120,
              hit: true,
              radius: 90,
              terrainRadius: 65,
              color: '#ffa66b',
              damage: [],
            });
            for (const t of frozenFighters)
              if (this.canDamage(a, t) && Math.hypot(t.x - c.x, t.y - c.y) < 100)
                damage.push({ target: t.id, source: id, raw: 30, shot });
          }
          if (c.material === 'wood' && w.status === 'burn')
            work.hazards.push({
              x: c.x,
              y: c.y + c.height,
              radius: 65,
              kind: 'fire',
              turns: 3,
              owner: id,
            });
        }
        if (work.map === 'canyon' && w.id === 'seismic')
          for (const t of frozenFighters)
            if (
              this.canDamage(a, t) &&
              Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y) < 110
            )
              damage.push({ target: t.id, source: id, raw: 12, shot });
      }
    }
    // Geometry is shared for the whole volley: impacts union their craters, never erase another shot's target retroactively.
    for (const shot of work.shots)
      if (shot.hit) this.terrain.crater(shot.impact.x, shot.impact.y, shot.terrainRadius ?? 0);
    for (const t of work.fighters) {
      if (priorStatuses.get(t.id)?.burn) damage.push({ target: t.id, raw: 9 });
      for (const h of work.hazards) {
        const source = h.owner ? this.pilot(h.owner) : undefined;
        if (
          t.hp > 0 &&
          Math.hypot(t.x - h.x, t.y - h.y) < h.radius + 12 &&
          (!source || this.canDamage(source, t))
        )
          damage.push({ target: t.id, source: h.owner, raw: h.kind === 'lava' ? 14 : 9 });
      }
    }
    this.applySimultaneousDamage(damage);
    this.settle();
    work.terrain = this.terrain.pack();
    work.resolveAt = now + Math.max(900, ...work.shots.map((s) => s.impactMs! + 750));
    work.resolutionStartedAt = now;
    work.phase = 'resolving';
    work.activeId = '';
    this.outcome = work;
    this.state = publicState;
    this.state.shots = work.shots;
    this.state.abilityEvents = work.abilityEvents;
    this.state.superEvents = work.superEvents;
    for (const f of this.state.fighters)
      f.superpowerUsed = work.fighters.find((t) => t.id === f.id)!.superpowerUsed;
    this.state.resolutionStart = work.resolutionStart;
    this.state.phase = 'resolving';
    this.state.resolveAt = work.resolveAt;
    this.state.resolutionStartedAt = now;
    this.state.message = 'Sealed plans revealed. Resolving simultaneous attacks.';
    this.state.revision++;
    for (const a of this.state.fighters) {
      const p = this.plans.get(a.id);
      if (p && !p.pass) {
        a.angle = p.angle;
        a.power = p.power;
      }
    }
  }
  private applySimultaneousDamage(events: Damage[]) {
    for (const t of this.state.fighters) {
      const entries = events
        .filter((e) => e.target === t.id)
        .map((e) => ({
          ...e,
          value: Math.max(
            0,
            Math.round(
              e.raw *
                (e.pierce ? 1 : 1 - t.armor) *
                (t.statuses.fortify ? 0.45 : 1) *
                (t.statuses.phase ? 0.35 : 1),
            ),
          ),
        }));
      const total = entries.reduce((n, e) => n + e.value, 0),
        shield = Math.min(total, t.statuses.shield ?? 0),
        loss = Math.min(t.hp, total - shield);
      if (t.statuses.shield) t.statuses.shield -= shield;
      t.hp -= loss;
      let assigned = 0,
        assignedShield = 0;
      entries.forEach((e, i) => {
        const amount =
          i === entries.length - 1
            ? loss - assigned
            : Math.floor((loss * e.value) / Math.max(1, total));
        assigned += amount;
        const absorbed =
          i === entries.length - 1
            ? shield - assignedShield
            : Math.floor((shield * e.value) / Math.max(1, total));
        assignedShield += absorbed;
        if (e.shot) e.shot.damage.push({ id: t.id, amount, absorbed, x: t.x, y: t.y });
        if (e.source && e.source !== t.id) this.pilot(e.source).stats.damage += amount;
      });
      if (t.hp === 0 && entries.length) {
        const killer = entries
          .filter((e) => e.source && e.source !== t.id)
          .sort((a, b) => b.value - a.value || a.source!.localeCompare(b.source!))[0];
        if (killer) this.pilot(killer.source!).stats.kills++;
      }
    }
    for (const a of this.state.fighters)
      if (events.some((e) => e.source === a.id && e.target !== a.id && e.shot)) a.stats.hits++;
  }
  override nextTurn(now = Date.now()) {
    const revision = this.state.revision;
    if (this.outcome) {
      for (const f of this.outcome.fighters) {
        const current = this.state.fighters.find((p) => p.id === f.id);
        if (current) f.connected = current.connected;
      }
      this.state = this.outcome;
      this.outcome = null;
    }
    this.state.revision = Math.max(revision, this.state.revision) + 1;
    this.state.phase = 'planning';
    delete this.state.resolutionStart;
    this.state.resolveAt = 0;
    this.state.shots = [];
    this.state.abilityEvents = [];
    this.state.superEvents = [];
    this.state.readyIds = [];
    this.plans.clear();
    if (this.checkWin(now)) return;
    this.state.turn++;
    for (const f of this.state.fighters) {
      f.moved = 0;
      f.energy = Math.min(100, f.energy + 18);
      f.cooldown = Math.max(0, f.cooldown - 1);
      for (const inv of Object.values(f.weapons)) inv.cooldown = Math.max(0, inv.cooldown - 1);
      for (const [key, value] of Object.entries(f.statuses))
        if (key !== 'shield') {
          if (value! <= 1) delete f.statuses[key as keyof typeof f.statuses];
          else f.statuses[key as keyof typeof f.statuses] = value! - 1;
        }
      if (!f.statuses.shieldTurns) delete f.statuses.shield;
    }
    this.state.hazards = this.state.hazards.filter((h) => --h.turns > 0);
    environmentRound(this.state.environment!, this.state.map, this.state.turn, this.state.hazards);
    this.state.deadline = now + this.state.config.turnSeconds * 1000;
    this.botDeadline = now + 1600;
    this.state.message = 'Plan your next attack.';
    this.state.revision++;
  }
  override tick(now = Date.now()) {
    if (this.state.result) return false;
    const rev = this.state.revision;
    if (this.state.phase === 'resolving') {
      if (now >= this.state.resolveAt) this.nextTurn(now);
      return rev !== this.state.revision;
    }
    for (const f of this.state.fighters.filter((f) => f.hp > 0 && !this.plans.has(f.id))) {
      if (f.bot && now >= this.botDeadline) this.planBot(f);
      else if (now >= this.state.deadline || (!f.connected && this.state.config.skipDisconnected))
        this.plans.set(f.id, {
          round: this.state.turn,
          angle: 90,
          power: 10,
          weapon: 'standard',
          ability: false,
          pass: true,
        });
    }
    const ready = [...this.plans.keys()];
    if (ready.length !== this.state.readyIds!.length) {
      this.state.readyIds = ready;
      this.state.revision++;
    }
    if (this.allReady()) this.resolve(now);
    return rev !== this.state.revision;
  }
  private planBot(a: Fighter) {
    const target = this.state.fighters
      .filter((f) => enemy(a, f, this.state.config.mode === 'teams') && !f.statuses.cloak)
      .sort((a, b) => a.hp - b.hp)[0];
    let w = WEAPONS[TANKS[a.tank].weapon];
    if (a.weapons[w.id].cooldown) w = WEAPONS.standard;
    let best = { angle: a.x < 720 ? 45 : 135, power: 65, d: Infinity };
    if (target)
      for (let angle = 15; angle <= 165; angle += 5)
        for (let power = 35; power <= 100; power += 5) {
          const p = projectile(
            a,
            angle,
            power,
            w,
            mapById(this.state.map).gravity,
            this.terrain,
            this.state.fighters,
            a.id,
            this.state.config.mode === 'teams',
            this.state.environment,
          );
          const d = Math.hypot(p.impact.x - target.x, p.impact.y - target.y);
          if (d < best.d) best = { angle, power, d };
        }
    const p: Plan = {
      round: this.state.turn,
      angle: best.angle,
      power: best.power,
      weapon: w.id,
      ability: false,
    };
    try {
      this.validate(a, { ...p, ability: true });
      p.ability = true;
    } catch {}
    this.plans.set(a.id, p);
  }
  forfeit(id: string) {
    const a = this.pilot(id);
    a.hp = 0;
    if (this.outcome) {
      const f = this.outcome.fighters.find((p) => p.id === id);
      if (f) f.hp = 0;
    } else this.checkWin();
    this.state.revision++;
  }
  override botTurn(now: number) {
    for (const f of this.state.fighters.filter((f) => f.hp > 0)) this.planBot(f);
    this.state.readyIds = [...this.plans.keys()];
    this.resolve(now);
  }
}
