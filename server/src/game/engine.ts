import { randomUUID } from 'node:crypto';
import { TANKS, TANK_IDS } from '../../../shared/src/configs/tanks';
import { MAPS, mapById } from '../../../shared/src/configs/maps';
import { WEAPONS } from '../../../shared/src/configs/weapons';
import { activateAbility, enemy } from '../../../shared/src/abilities/abilities';
import { generateMap, HEIGHT, WIDTH, Terrain, random } from '../../../shared/src/maps/terrain';
import { coverAt } from '../../../shared/src/maps/environment';
import { projectile } from '../../../shared/src/physics/projectile';
import type {
  Command,
  Fighter,
  LobbyPlayer,
  MatchConfig,
  MatchState,
  Shot,
} from '../../../shared/src/types';
export class Game {
  state: MatchState;
  terrain: Terrain;
  private botAt = 0;
  constructor(players: LobbyPlayer[], config: MatchConfig, seed: number, now = Date.now()) {
    const rng = random(seed),
      map = config.map === 'random' ? MAPS[Math.floor(rng() * MAPS.length)].id : config.map;
    const generated = generateMap(seed, map, players.length);
    this.terrain = generated.terrain;
    // Interleave teams so teammates cannot monopolize consecutive turns.
    const ordered =
      config.mode === 'teams'
        ? [...players].sort(
            (a, b) =>
              players.filter((p) => p.team === a.team).indexOf(a) -
                players.filter((p) => p.team === b.team).indexOf(b) || a.team - b.team,
          )
        : [...players];
    const fighters = ordered.map((p, i): Fighter => {
      const tank =
        config.tankRule === 'random' ? TANK_IDS[Math.floor(rng() * TANK_IDS.length)] : p.tank;
      const def = TANKS[tank];
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        ready: p.ready,
        connected: p.connected,
        bot: p.bot,
        tank,
        ...generated.spawns[i],
        hp: Math.round(def.hp * config.healthMultiplier),
        maxHp: Math.round(def.hp * config.healthMultiplier),
        armor: def.armor,
        energy: 100,
        cooldown: 0,
        statuses: {},
        moved: 0,
        weapons: Object.fromEntries(
          [...new Set([def.weapon, 'standard', 'bouncing', 'guided', 'ice', 'incendiary'])].map(
            (id) => [id, { ammo: WEAPONS[id].ammo, cooldown: 0 }],
          ),
        ),
        stats: { damage: 0, shots: 0, hits: 0, kills: 0 },
        angle: i < players.length / 2 ? 45 : 135,
        power: 65,
      };
    });
    this.state = {
      id: randomUUID(),
      seed,
      map,
      fighters,
      terrain: this.terrain.pack(),
      hazards: generated.hazards,
      turn: 1,
      activeId: fighters[0].id,
      deadline: now + config.turnSeconds * 1000,
      startedAt: now,
      resolveAt: 0,
      revision: 0,
      shots: [],
      message: `${fighters[0].name} takes the first shot`,
      result: null,
      config: { ...config },
    };
    this.botAt = now + 1500;
  }
  get actor() {
    return this.state.fighters.find((t) => t.id === this.state.activeId)!;
  }
  action(playerId: string, command: Command, now = Date.now()) {
    if (command.type === 'lock') throw new Error('This room uses classic turns.');
    if (this.state.result) throw new Error('Match has ended.');
    if (this.state.activeId !== playerId) throw new Error('Wait for your turn.');
    if (this.state.resolveAt) throw new Error('A shot is still resolving.');
    if (now >= this.state.deadline) throw new Error('Turn timer expired.');
    const a = this.actor;
    if (a.hp <= 0) throw new Error('Tank is eliminated.');
    if (command.type === 'move') {
      const max = TANKS[a.tank].mobility * (a.statuses.freeze ? 0.3 : 1),
        allowed = Math.min(command.distance, max - a.moved);
      if (allowed <= 0) throw new Error('Movement budget exhausted.');
      let traveled = 0;
      for (let d = 0; d < allowed; d += 2) {
        const step = Math.min(2, allowed - traveled),
          x = a.x + command.direction * step;
        if (
          this.state.fighters.some(
            (t) => t.id !== a.id && t.hp > 0 && Math.abs(t.x - x) < 38 && Math.abs(t.y - a.y) < 30,
          )
        )
          break;
        if (
          x < 24 ||
          x > WIDTH - 24 ||
          coverAt(this.state.environment, x + command.direction * 20, a.y)
        )
          break;
        const y = this.terrain.surface(x, Math.max(0, a.y - 16)) - 12;
        if (y < a.y - 20 || y > HEIGHT) break;
        a.x = x;
        a.y = y;
        traveled += step;
      }
      a.moved = Math.min(max, a.moved + traveled);
      if (!traveled) throw new Error('Terrain blocks movement.');
      if (mapById(this.state.map).slippery) {
        const drift = Math.min(4, max - a.moved);
        const x = a.x + command.direction * drift;
        const y = this.terrain.surface(x) - 12;
        if (
          x > 24 &&
          x < WIDTH - 24 &&
          Math.abs(y - a.y) < 24 &&
          !coverAt(this.state.environment, x + command.direction * 20, y) &&
          !this.state.fighters.some(
            (t) => t.id !== a.id && t.hp > 0 && Math.abs(t.x - x) < 38 && Math.abs(t.y - y) < 30,
          )
        ) {
          a.moved += drift;
          a.x = x;
          a.y = y;
        }
      }
      this.state.message = `${a.name} repositioned`;
      this.touch();
      return;
    }
    if (command.type === 'ability') {
      this.state.message = activateAbility({
        actor: a,
        fighters: this.state.fighters,
        teamMode: this.state.config.mode === 'teams',
        hazards: this.state.hazards,
        targetId: command.targetId,
        crater: (x, y, r) => this.terrain.crater(x, y, r),
        damage: (t, d) => this.damage(t, d, a),
      });
      this.settle(a);
      this.state.terrain = this.terrain.pack();
      this.checkWin(now);
      this.touch();
      return;
    }
    if (command.type === 'pass') {
      this.nextTurn(now);
      return;
    }
    const weapon = { ...WEAPONS[command.weapon] },
      inventory = a.weapons[command.weapon];
    if (
      !Object.hasOwn(WEAPONS, command.weapon) ||
      !Object.hasOwn(a.weapons, command.weapon) ||
      !inventory
    )
      throw new Error('Weapon is not equipped.');
    if (inventory.ammo === 0) throw new Error('No ammunition left.');
    if (inventory.cooldown > 0) throw new Error('Weapon is cooling down.');
    if (inventory.ammo > 0) inventory.ammo--;
    inventory.cooldown = weapon.cooldown + 1;
    a.angle = command.angle;
    a.power = command.power;
    delete a.statuses.cloak;
    const boost = !!a.statuses.overcharge,
      count = a.tank === 'viper' && a.statuses.hunter ? 5 : weapon.projectiles,
      multiplier = a.tank === 'nova' && boost ? 1.65 : 1;
    if (a.tank === 'viper' && a.statuses.hunter) weapon.behavior = 'guided';
    delete a.statuses.hunter;
    delete a.statuses.overcharge;
    a.stats.shots++;
    let hit = false;
    const shots: Shot[] = [];
    for (let i = 0; i < count; i++) {
      const flight = projectile(
        a,
        command.angle + (i - (count - 1) / 2) * 4,
        command.power,
        weapon,
        mapById(this.state.map).gravity,
        this.terrain,
        this.state.fighters,
        a.id,
        this.state.config.mode === 'teams',
      );
      const shot: Shot = {
        weapon: weapon.id,
        owner: a.id,
        hit: flight.hit,
        terrainRadius: weapon.terrain,
        launchMs: (weapon.chargeMs ?? 180) + i * (weapon.launchGapMs ?? 110),
        impactMs: (weapon.chargeMs ?? 180) + i * (weapon.launchGapMs ?? 110) + flight.durationMs,
        path: flight.path,
        impact: flight.impact,
        radius: flight.hit ? weapon.radius : 0,
        color: weapon.color,
        damage: [],
      };
      if (flight.hit) {
        this.terrain.crater(flight.impact.x, flight.impact.y, weapon.terrain);
        const damaged = new Set<string>();
        for (const t of this.state.fighters) {
          const distance = Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y),
            direct = t.id === flight.directId;
          if (t.hp <= 0 || (!direct && distance > weapon.radius + 14) || !this.canDamage(a, t))
            continue;
          const raw =
            (weapon.damage * Math.max(0.15, 1 - distance / (weapon.radius + 18)) +
              (direct ? weapon.direct : 0)) *
            TANKS[a.tank].damage *
            multiplier *
            this.state.config.damageMultiplier;
          const amount = this.damage(t, raw, a, weapon.behavior === 'pierce');
          shot.damage.push({ id: t.id, amount, x: t.x, y: t.y });
          damaged.add(t.id);
          if (t.id !== a.id) hit = true;
          if (weapon.status && t.hp > 0) t.statuses[weapon.status] = 2;
          if (t.id !== a.id) {
            const push = Math.sign(t.x - flight.impact.x) * Math.min(12, weapon.radius / 5);
            t.x = Math.max(22, Math.min(WIDTH - 22, t.x + push));
          }
        }
        if (weapon.behavior === 'chain') {
          const chain = this.state.fighters.find(
            (t) =>
              t.hp > 0 &&
              !damaged.has(t.id) &&
              enemy(a, t, this.state.config.mode === 'teams') &&
              Math.hypot(t.x - flight.impact.x, t.y - flight.impact.y) < 170,
          );
          if (chain) {
            const amount = this.damage(
              chain,
              weapon.damage * 0.55 * this.state.config.damageMultiplier,
              a,
            );
            shot.damage.push({ id: chain.id, amount, x: chain.x, y: chain.y });
            chain.statuses.emp = 1;
            hit = true;
          }
        }
        if (weapon.status === 'burn')
          this.state.hazards.push({
            x: flight.impact.x,
            y: flight.impact.y,
            radius: weapon.radius,
            kind: 'fire',
            turns: 3,
            owner: a.id,
          });
      }
      shots.push(shot);
    }
    if (hit) a.stats.hits++;
    this.settle(a);
    this.state.shots = shots;
    this.state.terrain = this.terrain.pack();
    this.state.resolutionStartedAt = now;
    this.state.resolveAt = now + Math.max(2400, ...shots.map((s) => s.impactMs! + 750));
    this.state.message = `${a.name} fired ${weapon.name}`;
    this.touch();
  }
  canDamage(a: Fighter, t: Fighter) {
    return (
      a.id === t.id ||
      this.state.config.mode !== 'teams' ||
      this.state.config.friendlyFire ||
      a.team !== t.team
    );
  }
  damage(target: Fighter, raw: number, source?: Fighter, pierce = false) {
    if (target.hp <= 0) return 0;
    let amount = Math.max(
      0,
      Math.round(
        raw *
          (pierce ? 1 : 1 - target.armor) *
          (target.statuses.fortify ? 0.45 : 1) *
          (target.statuses.phase ? 0.35 : 1),
      ),
    );
    if (target.statuses.shield) {
      const absorb = Math.min(target.statuses.shield, amount);
      amount -= absorb;
      target.statuses.shield -= absorb;
      if (target.statuses.shield === 0) delete target.statuses.shield;
    }
    amount = Math.min(target.hp, amount);
    target.hp -= amount;
    if (source && source.id !== target.id) {
      source.stats.damage += amount;
      if (target.hp === 0) source.stats.kills++;
    }
    return amount;
  }
  settle(source?: Fighter) {
    for (const t of this.state.fighters) {
      if (t.hp <= 0) continue;
      const old = t.y;
      let support = Math.min(
        this.terrain.surface(t.x - 10, Math.max(0, old)),
        this.terrain.surface(t.x + 10, Math.max(0, old)),
      );
      t.y = support - 12;
      if (t.y > HEIGHT) {
        this.damage(t, t.hp * 4, source, true);
        t.hp = 0;
      } else if (t.y - old > 72) this.damage(t, (t.y - old - 72) * 0.3, source, true);
    }
  }
  private touch() {
    this.state.revision++;
  }
  nextTurn(now = Date.now()) {
    this.state.resolveAt = 0;
    this.state.shots = [];
    const ending = this.actor;
    for (const [status, value] of Object.entries(ending.statuses))
      if (status !== 'shield') {
        if (value! <= 1) delete ending.statuses[status as keyof typeof ending.statuses];
        else ending.statuses[status as keyof typeof ending.statuses] = value! - 1;
      }
    if (!ending.statuses.shieldTurns) delete ending.statuses.shield;
    if (this.checkWin(now)) return;
    const fs = this.state.fighters,
      current = fs.indexOf(this.actor);
    for (let i = 1; i <= fs.length; i++) {
      const candidate = fs[(current + i) % fs.length];
      if (
        candidate.hp <= 0 ||
        (!candidate.connected && !candidate.bot && this.state.config.skipDisconnected)
      )
        continue;
      this.state.activeId = candidate.id;
      this.state.turn++;
      candidate.moved = 0;
      candidate.cooldown = Math.max(0, candidate.cooldown - 1);
      candidate.energy = Math.min(100, candidate.energy + 18);
      for (const inv of Object.values(candidate.weapons))
        inv.cooldown = Math.max(0, inv.cooldown - 1);
      if (candidate.statuses.burn) this.damage(candidate, 9);

      for (const zone of this.state.hazards) {
        const owner = fs.find((f) => f.id === zone.owner);
        if (
          Math.hypot(candidate.x - zone.x, candidate.y - zone.y) < zone.radius + 12 &&
          (!owner || this.canDamage(owner, candidate))
        )
          this.damage(candidate, zone.kind === 'lava' ? 14 : 9, owner);
      }
      if (this.state.turn % fs.length === 0)
        this.state.hazards = this.state.hazards.filter((z) => --z.turns > 0);
      if (this.checkWin(now)) return;
      if (candidate.hp <= 0) continue;
      this.state.deadline = now + this.state.config.turnSeconds * 1000;
      this.botAt = now + 1300;
      this.state.message = `${candidate.name}'s turn`;
      this.touch();
      return;
    }
    // No connected survivor: freeze the turn until reconnect or match timeout.
    this.state.deadline = now + 1000;
    this.touch();
  }
  checkWin(now = Date.now()) {
    if (this.state.result) return true;
    const alive = this.state.fighters.filter((t) => t.hp > 0),
      groups = new Set(alive.map((t) => (this.state.config.mode === 'teams' ? t.team : t.id))),
      timeout = now - this.state.startedAt >= this.state.config.durationMinutes * 60000;
    if (groups.size > 1 && !timeout) return false;
    let winnerIds: string[] = [],
      reason = 'Last tank standing';
    if (alive.length === 0) reason = 'Mutual destruction';
    else if (timeout) {
      reason =
        this.state.config.winCondition === 'damage'
          ? 'Time limit · highest damage'
          : 'Time limit · remaining health';
      const scores = new Map<string | number, number>();
      for (const t of this.state.fighters) {
        const group = this.state.config.mode === 'teams' ? t.team : t.id;
        const score = this.state.config.winCondition === 'damage' ? t.stats.damage : t.hp / t.maxHp;
        scores.set(group, (scores.get(group) ?? 0) + score);
      }
      const best = Math.max(...scores.values()),
        winners = [...scores].filter(([, s]) => Math.abs(s - best) < 0.00001).map(([g]) => g);
      if (winners.length === 1)
        winnerIds = this.state.fighters
          .filter((t) => winners.includes(this.state.config.mode === 'teams' ? t.team : t.id))
          .map((t) => t.id);
    } else {
      winnerIds =
        this.state.config.mode === 'teams'
          ? this.state.fighters.filter((t) => t.team === alive[0].team).map((t) => t.id)
          : alive.map((t) => t.id);
      reason = this.state.config.mode === 'teams' ? 'Last team standing' : reason;
    }
    this.state.result = {
      winnerIds,
      draw: winnerIds.length === 0,
      reason,
      duration: Math.round((now - this.state.startedAt) / 1000),
      rankings: this.state.fighters
        .map((t) => ({ id: t.id, name: t.name, team: t.team, hp: t.hp, ...t.stats }))
        .sort(
          (a, b) =>
            Number(winnerIds.includes(b.id)) - Number(winnerIds.includes(a.id)) ||
            b.damage - a.damage ||
            b.hp - a.hp,
        ),
    };
    this.state.message = this.state.result.draw
      ? 'The arena calls it a draw.'
      : 'Victory is decided.';
    this.touch();
    return true;
  }
  tick(now = Date.now()) {
    if (this.state.result) return false;
    const rev = this.state.revision;
    if (this.state.resolveAt) {
      if (now >= this.state.resolveAt) this.nextTurn(now);
      return rev !== this.state.revision;
    }
    if (this.checkWin(now)) return true;
    if (
      now >= this.state.deadline ||
      (!this.actor.connected && !this.actor.bot && this.state.config.skipDisconnected)
    )
      this.nextTurn(now);
    else if (this.actor.bot && now >= this.botAt) {
      this.botTurn(now);
    }
    return rev !== this.state.revision;
  }
  botTurn(now: number) {
    const actor = this.actor,
      targets = this.state.fighters.filter(
        (t) => enemy(actor, t, this.state.config.mode === 'teams') && !t.statuses.cloak,
      );
    if (!targets.length) {
      this.action(
        actor.id,
        {
          type: 'fire',
          angle: actor.x < WIDTH / 2 ? 50 : 130,
          power: 60,
          weapon: TANKS[actor.tank].weapon,
        },
        now,
      );
      return;
    }
    const target = targets.sort((a, b) => Math.abs(a.x - actor.x) - Math.abs(b.x - actor.x))[0];
    if (actor.cooldown === 0 && actor.energy >= TANKS[actor.tank].ability.cost)
      try {
        this.action(actor.id, { type: 'ability' }, now);
      } catch {}
    if (this.state.result) return;
    const weapon = WEAPONS[TANKS[actor.tank].weapon];
    let best = { distance: Infinity, angle: 45, power: 65 };
    for (let angle = 15; angle < 170; angle += 5)
      for (let power = 30; power <= 100; power += 5) {
        const f = projectile(
          actor,
          angle,
          power,
          weapon,
          mapById(this.state.map).gravity,
          this.terrain,
          this.state.fighters,
          actor.id,
          this.state.config.mode === 'teams',
        );
        const distance = Math.hypot(f.impact.x - target.x, f.impact.y - target.y);
        if (distance < best.distance) best = { distance, angle, power };
      }
    this.action(
      actor.id,
      { type: 'fire', angle: best.angle, power: best.power, weapon: weapon.id },
      now,
    );
  }
}
