import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './style.css';
import './battle.css';
import { BattleControls } from './input/BattleControls';
import { ENVIRONMENT_RULES } from '../../shared/src/maps/environment';
import { TANKS, TANK_IDS } from '../../shared/src/configs/tanks';
import { MAPS, mapById } from '../../shared/src/configs/maps';
import { WEAPONS } from '../../shared/src/configs/weapons';
import { DEFAULT_CONFIG } from '../../shared/src/configs/match';
import { generateMap, COLS, ROWS, CELL } from '../../shared/src/maps/terrain';
import type { RoomState, TankId, MatchConfig, Command } from '../../shared/src/types';
import {
  connect,
  identity,
  request,
  remember,
  forget,
  sendCommand,
  socket,
} from './networking/network';
import { mountArena } from './scenes/BattleScene';
import { tankArt } from './ui/art';
import { sound } from './audio/sound';
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || '';
const app = document.querySelector<HTMLDivElement>('#app')!;
let room: RoomState | null = null,
  page = 'play',
  arena: ReturnType<typeof mountArena> | null = null,
  angle = 45,
  power = 65,
  weapon = 'standard',
  lastTurn = '',
  lastResult = '',
  connected = socket.connected,
  clockOffset = 0,
  selectedTank: TankId = 'titan',
  modalKind = '',
  busy = false;
let battleControls: BattleControls | null = null;
let accountToken = localStorage.getItem('arena-account') ?? '',
  callsign = localStorage.getItem('arena-name') ?? 'Commander';
const escape = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const btn = (action: string, text: string, cls = 'button', extra = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
function toast(message: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el?.classList.remove('show'), 4500);
}
async function task(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  try {
    sound.unlock();
    await fn();
  } catch (e: any) {
    toast(e.message);
  } finally {
    busy = false;
  }
}
function header() {
  return `<header class="topbar"><a href="#" class="brand" data-action="home" aria-label="Tank Arena home"><span class="brand-mark"><i></i></span><span>TANK<span class="brand-light">ARENA</span><small>CHAOS WARS</small></span></a><nav aria-label="Main navigation">${['play', 'armory', 'guide'].map((p) => btn(p, p === 'play' ? 'Play' : p === 'armory' ? 'Tank collection' : 'Field guide', `nav-link ${page === p ? 'active' : ''}`)).join('')}</nav><div class="top-right"><span class="connection ${connected ? 'online' : ''}" title="Server connection"><i></i><span>${connected ? 'SYSTEMS ONLINE' : 'CONNECTING'}</span></span>${btn('settings', '<span aria-hidden="true">⚙</span>', 'icon-button', 'aria-label="Settings"')}${btn('account', `<span class="avatar">${escape(callsign.slice(0, 1).toUpperCase())}</span><span class="profile-name">${escape(callsign)}<small>${accountToken ? 'PILOT ACCOUNT' : 'GUEST PILOT'}</small></span>`, 'profile', 'aria-label="Pilot account"')}</div></header>`;
}
function destroyArena() {
  battleControls?.destroy();
  battleControls = null;
  document.body.classList.remove('in-battle');
  arena?.game.destroy(true);
  arena = null;
}
function render() {
  destroyArena();
  app.innerHTML =
    header() +
    `<main id="main"></main><footer class="footer"><span><i class="tiny-square"></i> MADE FOR FRIENDLY RIVALRIES.</span><span>Original machines. Unpredictable battles. <b>v1.0</b></span></footer><div id="modal-root"></div>`;
  const main = document.getElementById('main')!;
  if (room?.phase === 'lobby') renderLobby(main);
  else if (room?.phase === 'battle' || room?.phase === 'results') renderBattle(main);
  else if (page === 'armory') renderArmory(main);
  else if (page === 'guide') renderGuide(main);
  else renderHome(main);
}
function renderHome(main: HTMLElement) {
  main.innerHTML = `<section class="hero"><div id="hero-arena" class="hero-arena"></div><div class="hero-shade"></div><div class="hero-copy"><div class="eyebrow"><span class="tiny-square"></span> TURN-BASED. FRIENDSHIP-TESTED.</div><h1>BIG GUNS.<br>BIGGER<br><span>RIVALRIES.</span></h1><p>Pick your machine. Make your mark.<br>Send your friends back to the drawing board.</p><div class="hero-actions">${btn('solo', 'Enter the arena <span>↗</span>', 'button primary')}${btn('friends', 'Play with friends <span>◈</span>', 'button glass')}</div><div class="hero-meta"><span><b>10</b> ORIGINAL TANKS</span><i></i><span><b>8</b> PLAYERS. ONE ARENA.</span></div></div><div class="hero-location"><span class="live-dot"></span><div>DESERT DUNES<small>34° N · THE FRONTIER</small></div><span class="location-lines">⌁</span></div><div class="hero-tag">EVERY SHOT CHANGES THE LANDSCAPE.</div></section>
 <section class="play-section"><div class="section-heading"><div><span class="eyebrow">YOUR NEXT GOOD BAD IDEA</span><h2>Pick your battle.</h2></div><span class="muted">A little strategy. A lot of collateral damage.</span></div><div class="mode-grid">
 <button class="mode-card" data-action="solo"><span class="mode-icon">◎</span><span class="mode-number">01 / TRAINING GROUNDS</span><h3>Solo skirmish <span>↗</span></h3><p>Meet your machine. Take on the bots.<br>Find your favorite way to cause chaos.</p><span class="mode-bottom"><i class="dot green"></i> YOU VS. THE MACHINES <b>1–8 PLAYERS</b></span></button>
 <button class="mode-card featured" data-action="friends"><span class="mode-icon">◈</span><span class="mode-number">02 / PRIVATE LOBBY</span><h3>Friends & friendly fire <span>↗</span></h3><p>Your room. Your rules. Your bragging rights.<br>Invite the crew and settle the score.</p><span class="mode-bottom"><i class="dot amber"></i> BETTER WITH FRIENDS <b>2–8 PLAYERS</b></span></button>
 <button class="mode-card" data-action="quick"><span class="mode-icon">ϟ</span><span class="mode-number">03 / PUBLIC MATCHMAKING</span><h3>Quick match <span>↗</span></h3><p>Skip the small talk. Find a rival.<br>Jump straight into the crossfire.</p><span class="mode-bottom"><i class="dot violet"></i> FIND YOUR NEXT RIVAL <b>1V1</b></span></button></div></section>
 <section class="collection-section"><div class="section-heading"><div><span class="eyebrow">NOT YOUR AVERAGE MOTOR POOL</span><h2>Meet the troublemakers.</h2></div>${btn('armory', 'Explore all 10 tanks <span>→</span>', 'text-button')}</div><div class="tank-grid home-tanks">${(['titan', 'phantom', 'volt', 'inferno'] as TankId[]).map(tankCard).join('')}</div></section>`;
  arena = mountArena('hero-arena');
}
function tankCard(id: TankId) {
  const t = TANKS[id];
  return `<button class="tank-card ${selectedTank === id ? 'selected' : ''}" data-tank="${id}" style="--tank:${t.color}"><div class="card-top"><span>${t.role.toUpperCase()}</span><span class="tank-index">${String(TANK_IDS.indexOf(id) + 1).padStart(2, '0')} / 10</span></div><img src="${tankArt(id)}" alt="${t.name}, an original ${t.role.toLowerCase()} tank"><div class="tank-card-bottom"><h3>${t.name}</h3><span>↗</span></div><p>${t.ability.name} <span>·</span> ${t.hp} HP</p></button>`;
}
function renderArmory(main: HTMLElement) {
  main.innerHTML = `<section class="page-heading"><div class="eyebrow">THE FOUNDERS COLLECTION · ALL UNLOCKED</div><h1>Choose your kind<br>of <em>chaos.</em></h1><p>Ten original machines. Ten ways to turn the tide.</p></section><div class="tank-grid armory-grid">${TANK_IDS.map(tankCard).join('')}</div>`;
}
function tankModal(id: TankId) {
  selectedTank = id;
  const t = TANKS[id];
  showModal(
    `<div class="eyebrow">${t.category}</div><h2>${t.name}</h2><div class="tank-detail-art" style="--tank:${t.color}"><img src="${tankArt(id)}" alt="${t.name}"></div><span class="pill">${t.role}</span><p>${t.description}</p><div class="stat-grid">${[
      ['Health', t.hp],
      ['Armor', Math.round(t.armor * 100) + '%'],
      ['Movement', t.mobility + 'm'],
      ['Damage', Math.round(WEAPONS[t.weapon].damage * t.damage)],
    ]
      .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`)
      .join(
        '',
      )}</div><div class="ability-description"><span>✦</span><div><h3>${t.ability.name}</h3><p>${t.ability.description}</p><small>${t.ability.cost} ENERGY · ${t.ability.cooldown} TURN COOLDOWN</small></div></div><p class="muted">Tradeoff: ${t.weakness}</p>${btn('choose-tank', room ? 'Select this tank' : 'Take it for a spin', 'button primary full')}`,
    'tank',
  );
}
function renderGuide(main: HTMLElement) {
  main.innerHTML = `<section class="page-heading"><div class="eyebrow">A LITTLE KNOW-HOW GOES A LONG WAY</div><h1>Make every<br><em>shot count.</em></h1></section><div class="guide-grid"><article class="panel"><span class="eyebrow">01 / THE BASICS</span><h2>Move. Aim. Make a crater.</h2><p>All living pilots plan together. Move within your tank’s range, queue a special, then lock in. Choices stay secret until everyone is ready. All attacks resolve in the same round. The host can also select classic turns.</p><p>The dotted line previews your own trajectory, including wind and gravity fields. Higher power sends a shell farther. An angle of 90° fires straight up; angles above 90° fire left.</p><p>Standing on the edge? Explosions remove real terrain. Long falls hurt. Floating island gaps can eliminate a tank.</p></article><article class="panel"><span class="eyebrow">02 / THE CONTROLS</span><h2>Your command center.</h2><dl><dt>A / D</dt><dd>Move left / right</dd><dt>← / →</dt><dd>Move left / right</dd><dt>W / S</dt><dd>Adjust power</dd><dt>Space</dt><dd>Lock in your shot</dd><dt>E</dt><dd>Queue special ability</dd><dt>Drag arena</dt><dd>Aim the cannon</dd><dt>1–6</dt><dd>Select weapon</dd><dt>Escape</dt><dd>Settings</dd></dl><p>On touch screens, use separate movement and aiming joysticks, the vertical power slider, and weapon boxes. Once locked, your plan cannot change.</p></article><article class="panel"><span class="eyebrow">03 / THE CREW</span><h2>Bring a worthy rival.</h2><p>Create a room, copy its invitation link, and send it to your friends. Everyone chooses a tank and marks ready; the host starts the match.</p><p>Team battles need complete teams. Fill missing seats with bots. Team labels are shown alongside colors.</p><p>If disconnected, reopen the same tab within two minutes. Your seat and the server’s state will be restored. Disconnected hosts transfer after 30 seconds.</p></article></div><div class="section-heading"><h2>Ten worlds. Endless wreckage.</h2></div><div class="map-grid">${MAPS.map((m) => `<article class="map-card"><img src="${mapPreview(m.id)}" alt="${m.name} terrain preview"><div><h3>${m.name}</h3><p>${ENVIRONMENT_RULES[m.id]}</p></div></article>`).join('')}</div>`;
}
const previews = new Map<string, string>();
function mapPreview(id: string) {
  if (previews.has(id)) return previews.get(id)!;
  const theme = mapById(id),
    c = document.createElement('canvas');
  c.width = 480;
  c.height = 180;
  const ctx = c.getContext('2d')!,
    g = ctx.createLinearGradient(0, 0, 0, 180);
  g.addColorStop(0, theme.sky);
  g.addColorStop(1, theme.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 480, 180);
  ctx.fillStyle = theme.surface + '66';
  ctx.beginPath();
  ctx.arc(380, 48, 21, 0, Math.PI * 2);
  ctx.fill();
  const { terrain } = generateMap(7862, theme.id, 4);
  ctx.fillStyle = theme.earth;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (terrain.data[y * COLS + x]) ctx.fillRect((x * CELL) / 3, (y * CELL) / 4, 2, 2);
  ctx.fillStyle = theme.surface;
  for (let x = 0; x < COLS; x++) ctx.fillRect((x * CELL) / 3, terrain.surface(x * CELL) / 4, 2, 2);
  const url = c.toDataURL();
  previews.set(id, url);
  return url;
}
function showModal(content: string, kind: string) {
  modalKind = kind;
  document.getElementById('modal-root')!.innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${kind}">${btn('close', '×', 'modal-close', 'aria-label="Close dialog"')}${content}</section></div>`;
  document.querySelector<HTMLInputElement>('.modal input')?.focus();
}
function closeModal() {
  modalKind = '';
  document.getElementById('modal-root')!.innerHTML = '';
}
function friendsModal() {
  showModal(
    `<div class="eyebrow">GOOD COMPANY. BAD INTENTIONS.</div><h2>Bring your crew.</h2><p>Set up a private arena or join an existing room.</p><label>Your callsign<input id="name" maxlength="20" value="${escape(callsign)}" autocomplete="nickname"></label><label>Room password <span class="muted">optional</span><input id="password" type="password" maxlength="64" placeholder="Only your crew knows"></label>${btn('create', 'Create a private room <span>↗</span>', 'button primary full')}<div class="divider"><span>OR JOIN THE ACTION</span></div><label>Room code<input id="room-code" maxlength="6" placeholder="ABC234" class="code-input" value="${escape(new URLSearchParams(location.search).get('room') ?? '')}"></label>${btn('join', 'Join room <span>→</span>', 'button secondary full')}`,
    'friends',
  );
}
function value(id: string) {
  return (document.getElementById(id) as HTMLInputElement)?.value ?? '';
}
function entry() {
  const name = (value('name') || callsign).trim();
  callsign = name;
  localStorage.setItem('arena-name', name);
  return { name, password: value('password'), accountToken };
}
async function enter(event: string, data: any) {
  const reply = await request(event, data);
  remember(reply);
  closeModal();
  if (reply.room) {
    room = reply.room;
    page = 'play';
    render();
  }
}
async function solo() {
  const reply = await request('create', { name: callsign, accountToken });
  remember(reply);
  room = reply.room!;
  await request('configure', { ...DEFAULT_CONFIG, maxPlayers: 2, bots: 1, map: 'desert' });
  await request('select', { tank: selectedTank, team: 0 });
  await request('ready', true);
  await request('start');
  closeModal();
}
function renderLobby(main: HTMLElement) {
  const r = room!,
    host = r.hostId === identity.id,
    me = r.players.find((p) => p.id === identity.id),
    config = r.config;
  main.innerHTML = `<section class="lobby-heading"><div><span class="eyebrow">${config.visibility === 'public' ? 'PUBLIC MATCHMAKING · BOT JOINS AFTER 10 SECONDS' : 'PRIVATE ROOM · YOUR RULES'}</span><h1>Assemble the crew<span>.</span></h1></div><div class="room-code"><small>ROOM CODE</small><b>${r.code}</b>${btn('copy', 'Copy invite ↗', 'text-button')}</div></section><div class="lobby-layout"><section class="panel crew-panel"><div class="panel-heading"><h2>Pilots <span>${r.players.length} / ${config.maxPlayers}</span></h2><span class="pill">${config.mode === 'teams' ? `${config.teams} TEAMS` : 'FREE FOR ALL'}</span></div><div class="crew-list">${r.players.map((p, i) => `<div class="crew-row"><span class="crew-number">${String(i + 1).padStart(2, '0')}</span><img src="${tankArt(p.tank)}" alt=""><div><b>${escape(p.name)} ${p.id === identity.id ? '<small>YOU</small>' : ''}</b><span>${TANKS[p.tank].name} ${config.mode === 'teams' ? '· TEAM ' + (p.team + 1) : ''}${p.id === r.hostId ? ' · HOST' : ''}</span></div><span class="ready-status ${p.ready ? 'is-ready' : ''}">${!p.connected ? 'OFFLINE' : p.ready ? '✓ READY' : 'CHOOSING'}</span></div>`).join('')}${Array.from({ length: Math.max(0, config.maxPlayers - r.players.length) }, (_, i) => `<div class="crew-row empty"><span class="crew-number">${String(i + r.players.length + 1).padStart(2, '0')}</span><span class="empty-icon">+</span><span>${i < config.bots ? 'AI pilot will join at launch' : 'Waiting for a worthy rival…'}</span></div>`).join('')}</div><div class="lobby-actions">${btn('ready', me?.ready ? '✓ Ready — undo' : 'Mark ready', me?.ready ? 'button success' : 'button primary')}${host ? btn('start', 'Launch battle →', 'button secondary') : ''}${btn('leave', 'Leave room', 'text-button')}</div><p class="fine-print">All pilots must be ready. ${config.mode === 'teams' ? 'Every team must be full.' : 'At least two pilots or bots required.'}</p><div class="panel-heading tank-picker-heading"><h2>Your machine</h2><span class="muted">${me ? TANKS[me.tank].role : ''}</span></div><div class="tank-picker">${TANK_IDS.map((id) => `<button class="pick-tank ${me?.tank === id ? 'active' : ''}" data-select-tank="${id}" title="${TANKS[id].ability.name}" aria-label="Select ${TANKS[id].name}"><img src="${tankArt(id)}" alt=""><span>${TANKS[id].name}</span></button>`).join('')}</div>${config.mode === 'teams' ? `<label>Your team<select id="my-team">${Array.from({ length: config.teams }, (_, i) => `<option value="${i}" ${me?.team === i ? 'selected' : ''}>Team ${i + 1}</option>`).join('')}</select></label>` : ''}</section><aside class="panel rules-panel"><div class="panel-heading"><h2>Battlefield</h2><span class="eyebrow">${host ? 'HOST CONTROLS' : 'ROOM RULES'}</span></div><div class="map-preview"><img src="${mapPreview(config.map === 'random' ? 'desert' : config.map)}" alt="Battlefield preview"><span>${config.map === 'random' ? 'Uncharted territory' : mapById(config.map).name}<small>${config.map === 'random' ? 'A new world every match' : mapById(config.map).tag}</small></span></div><form id="rules"><fieldset ${host ? '' : 'disabled'}><label>Combat flow<select name="combatFlow"><option value="simultaneous" ${config.combatFlow !== 'turns' ? 'selected' : ''}>Simultaneous secret planning</option><option value="turns" ${config.combatFlow === 'turns' ? 'selected' : ''}>Classic turns</option></select></label><p class="fine-print">${ENVIRONMENT_RULES[config.map === 'random' ? 'desert' : config.map]}</p><label>Map<select name="map"><option value="random">Random battlefield</option>${MAPS.map((m) => `<option value="${m.id}" ${config.map === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label><div class="form-grid"><label>Mode<select name="mode"><option value="ffa" ${config.mode === 'ffa' ? 'selected' : ''}>Free for all</option><option value="teams" ${config.mode === 'teams' ? 'selected' : ''}>Team battle</option></select></label><label>Player limit<select name="maxPlayers">${[2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${config.maxPlayers === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><div class="form-grid"><label>Teams<select name="teams">${[2, 3, 4].map((n) => `<option ${config.teams === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>Team size<select name="teamSize">${[1, 2, 3, 4].map((n) => `<option ${config.teamSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><div class="form-grid"><label>AI pilots<select name="bots">${Array.from({ length: 8 }, (_, n) => `<option ${config.bots === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>Turn timer<select name="turnSeconds">${[15, 30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${config.turnSeconds === n ? 'selected' : ''}>${n} seconds</option>`).join('')}</select></label></div><details><summary>Advanced match rules <span>+</span></summary><div class="form-grid"><label>Health<select name="healthMultiplier">${[0.5, 1, 1.5, 2, 3].map((n) => `<option value="${n}" ${config.healthMultiplier === n ? 'selected' : ''}>${n}×</option>`).join('')}</select></label><label>Damage<select name="damageMultiplier">${[0.5, 1, 1.5, 2, 3].map((n) => `<option value="${n}" ${config.damageMultiplier === n ? 'selected' : ''}>${n}×</option>`).join('')}</select></label></div><label>Tank selection<select name="tankRule">${['open', 'unique', 'random'].map((t) => `<option ${config.tankRule === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><div class="form-grid"><label>Match minutes<input name="durationMinutes" type="number" min="1" max="60" value="${config.durationMinutes}"></label><label>Time-limit score<select name="winCondition"><option value="survival" ${config.winCondition === 'survival' ? 'selected' : ''}>Health remaining</option><option value="damage" ${config.winCondition === 'damage' ? 'selected' : ''}>Damage dealt</option></select></label></div><label>Room visibility<select name="visibility"><option value="private" ${config.visibility === 'private' ? 'selected' : ''}>Private</option><option value="public" ${config.visibility === 'public' ? 'selected' : ''}>Public</option></select></label><label class="check"><input type="checkbox" name="friendlyFire" ${config.friendlyFire ? 'checked' : ''}> Friendly fire</label><label class="check"><input type="checkbox" name="skipDisconnected" ${config.skipDisconnected ? 'checked' : ''}> Skip disconnected turns</label></details>${host ? '<button class="button secondary full" type="submit">Apply match rules</button>' : ''}</fieldset></form></aside></div>`;
  document.getElementById('rules')!.addEventListener('submit', (e) => {
    e.preventDefault();
    void task(async () => {
      const form = new FormData(e.target as HTMLFormElement),
        c: any = {};
      for (const key of Object.keys(DEFAULT_CONFIG)) {
        if (['friendlyFire', 'skipDisconnected'].includes(key)) c[key] = form.has(key);
        else if (typeof DEFAULT_CONFIG[key as keyof MatchConfig] === 'number')
          c[key] = Number(form.get(key));
        else c[key] = form.get(key);
      }
      await request('configure', c);
      toast('Match rules updated. Pilots must ready up again.');
    });
  });
  document.getElementById('my-team')?.addEventListener(
    'change',
    (e) =>
      void task(async () => {
        await request('select', {
          tank: me!.tank,
          team: Number((e.target as HTMLSelectElement).value),
        });
      }),
  );
}
function renderBattle(main: HTMLElement) {
  document.body.classList.add('in-battle');
  main.innerHTML =
    '<section class="battle-shell"><div id="battle-arena"></div><div id="battle-overlay"></div></section><section id="results"></section>';
  arena = mountArena('battle-arena');
  arena.scene.playerId = identity.id;
  battleControls = new BattleControls(
    document.getElementById('battle-overlay')!,
    identity.id,
    async (c) => {
      await sendCommand(c);
    },
    (a, p, w, target) => {
      if (arena) arena.scene.superTargetX = target;
      angle = a;
      power = p;
      weapon = w;
      syncAim();
    },
    toast,
    () => (modalKind ? closeModal() : settings()),
  );
  arena.game.events.once('ready', () => battleControls?.bindCanvas(arena!.game.canvas));
  // Phaser may already have created its canvas before the ready event listener.
  setTimeout(() => {
    if (arena?.game.canvas && !arena.game.canvas.dataset.bound) {
      arena.game.canvas.dataset.bound = 'true';
      battleControls?.bindCanvas(arena.game.canvas);
    }
  }, 200);
  updateBattle();
}
function updateBattle() {
  const s = room?.match;
  if (!s || !arena) return;
  arena.scene.playerId = identity.id;
  arena.scene.clockOffset = clockOffset;
  arena.scene.setState(s);
  battleControls?.update(s, connected, clockOffset);
  if (s.result && lastResult !== s.id) {
    lastResult = s.id;
    sound.victory();
  }
  if (s.result) renderResults();
}
function syncAim() {
  if (arena) {
    arena.scene.angle = angle;
    arena.scene.power = power;
    arena.scene.weapon = weapon;
  }
  const a = document.getElementById('angle-value'),
    p = document.getElementById('power-value');
  if (a) a.textContent = Math.round(angle) + '°';
  if (p) p.textContent = Math.round(power) + '%';
  const ai = document.getElementById('angle') as HTMLInputElement,
    pi = document.getElementById('power') as HTMLInputElement;
  if (ai) ai.value = String(angle);
  if (pi) pi.value = String(power);
}
function renderResults() {
  const result = room!.match!.result!,
    won = result.winnerIds.includes(identity.id),
    host = room!.hostId === identity.id;
  document.getElementById('results')!.innerHTML =
    `<div class="result-backdrop"><section class="results-card"><div class="eyebrow">${result.reason} · ${Math.floor(result.duration / 60)}M ${result.duration % 60}S</div><span class="result-emblem">${result.draw ? '◇' : won ? '✦' : '◎'}</span><h1>${result.draw ? 'A worthy standoff.' : won ? 'Glorious chaos.' : 'A lesson in gravity.'}</h1><p>${result.draw ? 'No winner this time. Run it back.' : won ? 'The arena is yours. Enjoy the bragging rights.' : 'Every crater is a learning opportunity. Next round?'}</p><div class="results-table"><div class="result-row headings"><span>PILOT</span><span>DAMAGE</span><span>HITS</span><span>ACCURACY</span></div>${result.rankings.map((p, i) => `<div class="result-row"><b>${result.winnerIds.includes(p.id) ? '★' : i + 1} ${escape(p.name)}${room!.config.mode === 'teams' ? ' · T' + (p.team + 1) : ''}</b><span>${p.damage}</span><span>${p.hits} / ${p.shots}</span><span>${p.shots ? Math.round((p.hits / p.shots) * 100) : 0}%</span></div>`).join('')}</div><div class="result-actions">${host ? btn('rematch', 'One more round ↗', 'button primary') + btn('lobby', 'Return to lobby', 'button secondary') : '<p class="muted">Waiting for the host to choose the next round.</p>'}${btn('leave', 'Leave arena', 'text-button')}</div></section></div>`;
}
function settings() {
  showModal(
    `<div class="eyebrow">MAKE YOURSELF COMFORTABLE</div><h2>Sound & settings.</h2><label>Master volume <input id="volume" type="range" min="0" max="100" value="${sound.volume * 100}"></label><label class="check"><input type="checkbox" id="music" ${sound.music ? 'checked' : ''}> Ambient soundtrack</label><p class="muted">All sound is synthesized for Tank Arena. Settings are saved on this device.</p><label class="check"><input type="checkbox" id="virtual-controls" ${document.body.classList.contains('virtual-controls') ? 'checked' : ''}> Show desktop joysticks</label><label class="check"><input type="checkbox" id="reduce-motion" ${document.body.classList.contains('reduce-motion') ? 'checked' : ''}> Reduce interface motion</label>${btn('stats', 'View career statistics →', 'button secondary full')}${btn('account', 'Pilot account →', 'text-button')}${room ? btn('leave', 'Leave room', 'text-button') : ''}`,
    'settings',
  );
  document
    .getElementById('volume')!
    .addEventListener('input', () => sound.setVolume(Number(value('volume')) / 100));
  document
    .getElementById('music')!
    .addEventListener('change', (e) => sound.setMusic((e.target as HTMLInputElement).checked));
  document.getElementById('virtual-controls')!.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    document.body.classList.toggle('virtual-controls', checked);
    localStorage.setItem('arena-virtual-controls', String(checked));
  });
  document.getElementById('reduce-motion')!.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    document.body.classList.toggle('reduce-motion', checked);
    localStorage.setItem('arena-reduce-motion', String(checked));
  });
}
function account() {
  showModal(
    `<div class="eyebrow">GIVE YOUR VICTORIES A HOME</div><h2>${accountToken ? 'Pilot account.' : 'Your callsign awaits.'}</h2><p>${accountToken ? 'Your completed matches are saved to your career.' : 'Play as a guest, or create an account to keep your battle statistics.'}</p>${accountToken ? `${btn('stats', 'View career →', 'button primary full')}${btn('logout', 'Sign out', 'button secondary full')}` : `<label>Callsign<input id="account-name" maxlength="20" value="${escape(callsign)}" autocomplete="username"></label><label>Password<input id="account-password" type="password" minlength="8" maxlength="128" placeholder="At least 8 characters" autocomplete="current-password"></label>${btn('login', 'Sign in →', 'button primary full')}${btn('register', 'Create pilot account', 'button secondary full')}`}<p class="fine-print">Guest progress is not tied to an account. Sign in before joining a room to save your results.</p>`,
    'account',
  );
}
async function authenticate(action: string) {
  const response = await fetch(SERVER_URL + '/api/auth/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: value('account-name'), password: value('account-password') }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  accountToken = data.token;
  callsign = data.name;
  localStorage.setItem('arena-account', accountToken);
  localStorage.setItem('arena-name', callsign);
  closeModal();
  render();
  toast('Pilot account connected.');
}
async function statistics() {
  if (!accountToken) {
    account();
    return;
  }
  const res = await fetch(SERVER_URL + '/api/profile', {
      headers: { Authorization: 'Bearer ' + accountToken },
    }),
    data = await res.json();
  if (!res.ok) throw new Error(data.error);
  showModal(
    `<div class="eyebrow">PILOT DOSSIER</div><h2>${escape(data.name)}</h2><div class="stat-grid"><div><small>Battles</small><b>${data.games}</b></div><div><small>Wins</small><b>${data.wins}</b></div><div><small>Damage</small><b>${data.damage}</b></div></div><h3>Recent skirmishes</h3>${data.history.length ? data.history.map((h: any) => `<div class="history-row"><b>${h.draw ? 'DRAW' : h.won ? 'VICTORY' : 'DEFEAT'}</b><span>${new Date(h.at).toLocaleDateString()}</span><span>${h.stats?.damage ?? 0} damage</span></div>`).join('') : '<p class="muted">Your story starts with your next battle.</p>'}`,
    'statistics',
  );
}
async function act(command: Command) {
  await sendCommand(command);
  if (command.type === 'ability') sound.ability();
  if (command.type === 'move') sound.move();
}
app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button,a');
  if (!el) return;
  if (el.dataset.tank) {
    tankModal(el.dataset.tank as TankId);
    return;
  }
  if (el.dataset.selectTank) {
    void task(async () => {
      await request('select', {
        tank: el.dataset.selectTank,
        team: room!.players.find((p) => p.id === identity.id)!.team,
      });
    });
    return;
  }
  const action = el.dataset.action;
  if (!action) return;
  e.preventDefault();
  void task(async () => {
    switch (action) {
      case 'home':
      case 'play':
      case 'armory':
      case 'guide':
        if (room) {
          toast('Leave your current room to browse the menu.');
          return;
        }
        page = action === 'home' ? 'play' : action;
        render();
        break;
      case 'solo':
        await solo();
        break;
      case 'friends':
        friendsModal();
        break;
      case 'quick':
        await enter('quick', { name: callsign, accountToken });
        break;
      case 'create':
        await enter('create', entry());
        break;
      case 'join':
        await enter('join', { ...entry(), code: value('room-code').toUpperCase().trim() });
        break;
      case 'close':
        closeModal();
        break;
      case 'copy': {
        const url = new URL(location.href);
        url.searchParams.set('room', room!.code);
        try {
          await navigator.clipboard.writeText(url.toString());
          toast('Invite link copied. Send it to your crew.');
        } catch {
          showModal(
            `<h2>Invite your crew.</h2><input readonly aria-label="Invitation link" value="${escape(url.toString())}"><p>Copy this link and send it to your friends.</p>`,
            'invite',
          );
        }
        break;
      }
      case 'ready':
        await request('ready', !room!.players.find((p) => p.id === identity.id)!.ready);
        break;
      case 'start':
        await request('start');
        break;
      case 'leave':
        if (room?.phase === 'battle') {
          showModal(
            `<h2>Leave this battle?</h2><p>Your tank will be eliminated. Your crew can finish the match.</p>${btn('confirm-leave', 'Leave battle', 'button primary full')}${btn('close', 'Stay in the fight', 'button secondary full')}`,
            'leave',
          );
        } else await leave();
        break;
      case 'confirm-leave':
        await leave();
        break;
      case 'move-left':
        await act({ type: 'move', direction: -1, distance: 12 });
        break;
      case 'move-right':
        await act({ type: 'move', direction: 1, distance: 12 });
        break;
      case 'fire':
        await act({ type: 'fire', angle, power, weapon });
        break;
      case 'pass':
        await act({ type: 'pass' });
        break;
      case 'ability':
        await act({
          type: 'ability',
          ...(value('heal-target') ? { targetId: value('heal-target') } : {}),
        });
        break;
      case 'lobby':
        await request('lobby');
        break;
      case 'rematch':
        await request('rematch');
        break;
      case 'settings':
        settings();
        break;
      case 'account':
        account();
        break;
      case 'stats':
        await statistics();
        break;
      case 'login':
      case 'register':
        await authenticate(action);
        break;
      case 'logout':
        accountToken = '';
        localStorage.removeItem('arena-account');
        closeModal();
        render();
        break;
      case 'choose-tank':
        if (room) {
          await request('select', {
            tank: selectedTank,
            team: room.players.find((p) => p.id === identity.id)!.team,
          });
          closeModal();
        } else await solo();
        break;
    }
  });
});
async function leave() {
  await request('leave');
  forget();
  room = null;
  lastTurn = '';
  closeModal();
  history.replaceState(null, '', location.pathname);
  render();
}

connect(
  (state) => {
    clockOffset = state.serverTime - Date.now();
    const previous = room?.phase;
    room = state;
    if (
      (previous === 'battle' || previous === 'results') &&
      (state.phase === 'battle' || state.phase === 'results') &&
      arena
    ) {
      if (previous === 'results' && state.phase === 'battle') {
        document.getElementById('results')!.innerHTML = '';
      }
      updateBattle();
    } else render();
  },
  toast,
  (status) => {
    connected = status;
    document.querySelector('.connection')?.classList.toggle('online', status);
    const label = document.querySelector('.connection span');
    if (label) label.textContent = status ? 'SYSTEMS ONLINE' : 'RECONNECTING';
    if (room?.phase === 'battle') updateBattle();
  },
  () => {
    room = null;
    lastTurn = '';
    render();
  },
);
setInterval(() => {
  const timer = document.getElementById('turn-time');
  if (timer && room?.match) {
    const remaining = Math.max(
      0,
      Math.ceil((room.match.deadline - Date.now() - clockOffset) / 1000),
    );
    timer.textContent = room.match.resolveAt ? '••' : String(remaining).padStart(2, '0');
    timer.classList.toggle('urgent', remaining <= 8);
  }
}, 200);
if (localStorage.getItem('arena-reduce-motion') === 'true')
  document.body.classList.add('reduce-motion');
render();
if (new URLSearchParams(location.search).has('room') && !identity.token) friendsModal();

document.body.classList.toggle(
  'virtual-controls',
  localStorage.getItem('arena-virtual-controls') === 'true',
);
