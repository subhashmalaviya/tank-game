# Tank Arena: Chaos Wars

An original, playable multiplayer artillery game built with **Phaser 3, TypeScript, Vite, Node.js, and Socket.IO**. Ten procedurally illustrated tanks, ten seeded worlds, destructible bitmap terrain, authoritative simultaneous secret planning and optional classic turns, private rooms, team battles, bots, reconnection, accounts, and match history.

## Run it

Prerequisites: **Node.js 22+ and npm 10+**. Docker with the Compose plugin is optional. You do not need PostgreSQL for local development.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite serves the client on port 5173 and proxies `/socket.io` and `/api` to the authoritative server on port 3001. `npm run dev:client` and `npm run dev:server` can also run in separate terminals.

Click **Enter the arena** for an immediate match against a bot. The same server engine runs solo and multiplayer battles. To choose another tank first, open **Tank collection**, select a card, and choose **Take it for a spin**.

## Play with friends

1. Click **Play with friends**, enter a callsign, and create a room. An optional password protects admission.
2. Copy the invitation link or share the six-character room code.
3. Friends open the link, enter their callsign and any room password, and join.
4. Pick tanks. The host selects the map and rules and clicks **Apply match rules**. Changing rules clears readiness.
5. Everyone marks ready. The host launches the battle.
6. After results, the host can start a rematch or return everyone to the lobby. Rematches keep the rules and generate a new seed.

For local multiplayer, use two independent browser windows/tabs at the same URL. Each tab stores its own seat in `sessionStorage`. Duplicating an existing tab can copy that seat: the latest connection then takes over, rather than creating a second player. Use a fresh tab or another browser profile for a new player.

A localhost invitation is accessible only on the same computer. For another device on your LAN, use the host computer's LAN address and configure the allowed origin:

```sh
ALLOWED_ORIGINS=http://192.168.1.20:5173 npm run dev
```

Replace the address with your own, allow inbound TCP 5173 on your firewall, and open that URL on both devices. Vite proxies the backend; clients do not need to connect to port 3001 directly. Use the HTTPS deployment below for internet play.

**Quick match** pairs pilots in a public 1v1 queue. If no second human arrives within ten seconds, a bot fills the other seat. Public rooms created manually remain host-controlled; the quick-match queue does not silently start them.

### Match configurations

- **Free for all:** 2–8 seats; any 2–8 current pilots can start. Bot count fills up to the player limit. Includes 1v1, 1v1v1, and all sizes through eight players.
- **Teams:** 2–4 teams, 1–4 tanks per team, at most eight total. `teams × teamSize` must equal `maxPlayers`, and all teams must be full at launch. Supports 2v2, 3v3, 4v4, 2v2v2, and 2v2v2v2. Bots fill available team slots.
- **Tank rules:** open selection, unique tanks per room, or randomized tank assignment.
- **Maps:** choose a theme or Random; every match gets a new seed.
- **Rules:** 10–120 second turns (the UI offers common presets), health and damage multipliers, friendly fire, disconnected-player skipping, 1–60 minute duration, and health or damage scoring at the time limit.
- Elimination always ends a match when only one player/team survives. A tie in time-limit scores or simultaneous elimination is a draw. Eliminated teammates still share a surviving team's victory.

## Controls and combat flow

The Phaser canvas fills the game viewport. HUD, movement/aim joysticks, power slider, inventory and action button overlay the battlefield. Portrait mode rearranges the controls and shows an optional landscape suggestion. Safe-area insets and dynamic viewport units accommodate mobile browser chrome.

| Action   | Desktop                       | Touch                                 |
| -------- | ----------------------------- | ------------------------------------- |
| Move     | Hold A/D or left/right arrows | Drag the left joystick                |
| Aim      | Drag on battlefield           | Drag the separate aim joystick        |
| Power    | Mouse wheel, W/S, or slider   | Vertical power slider                 |
| Weapon   | Number keys or weapon boxes   | Weapon boxes; + expands inventory     |
| Special  | E or ability button           | Ability button toggles queued special |
| Confirm  | Space or LOCK IN SHOT         | LOCK IN SHOT                          |
| Settings | Escape or gear                | Gear                                  |

Enable **Show desktop joysticks** in Settings if desired. Volume, ambient soundtrack and reduced motion are saved on the device. Settings does not pause an online match. Leave the match through Settings. Classic turns use FIRE and immediate ability activation instead of secret lock-in.

### Simultaneous rules

1. All living players may move and prepare a shot during the planning timer. Positions and generic readiness are public. Aim, power, selected weapon and queued special remain private.
2. LOCK IN SHOT stores a validated plan in a server-private map. Movement and edits are then prohibited. Reconnect returns only that pilot's own plan; opponents receive neutral aim values and no private inventory state.
3. When everyone is ready, defensive/healing/area abilities activate. An EMP submitted in the same round cannot retroactively cancel another valid sealed ability. If an ally moves outside Repair Field range or a Fault Line target becomes ineligible after lock, that ability fizzles without energy or cooldown cost; the shot still fires.
4. All projectiles are calculated against the same post-ability terrain, cover and fighter positions. Every eligible pilot fires, even if another shot will eliminate them. Impacts union their craters. Damage is accumulated, armor/buffs applied, and each shield absorbs from the combined volley once. This removes shot-order advantage for health and terrain collisions. Ability application uses stable pilot-ID order for overlapping heals/terrain effects.
5. Launch and impact timestamps, paths, damage attribution and terrain radii drive client effects. The server commits final HP and terrain when the final flight finishes. Clients replay server-confirmed HP/shield deltas at each impact, so bars respond when a hit lands. Shield absorption is labeled explicitly. Confirmed crater events can be drawn at impact. Surviving players enter the next round; simultaneous final eliminations draw.

A missed planning deadline submits a **pass**, not a guessed attack. With **Skip disconnected turns** enabled, an unsubmitted disconnected pilot passes on the next server tick. With it disabled they retain the seat until the deadline. Already sealed plans survive disconnects. Explicit leave forfeits the tank; launched attacks still resolve. Reconnection restores the authoritative snapshot. Match time limits are checked at round boundaries.

Angles run from 5° (right) to 175° (left). The private trajectory uses the same projectile simulation, wind, gravity and cover as the server. It previews one projectile at the selected angle, not all spread missiles; opponents can still move before the round resolves.

Movement consumes a per-round distance budget, including ice drift. Walls, cover, other tanks and gaps block movement. After terrain destruction tanks settle, long falls cause damage, and falling below the world eliminates a tank. Friendly-fire protection covers attacks and owned fire zones; shared terrain removal can still remove an ally's footing.

Abilities consume energy and impose cooldowns. Surviving pilots regain 18 energy each new round. Fortify and Phase Shift protect the current and following volley. EMP and freeze applied this round restrict the next planning phase. Shield strength expires after three volleys. Heavy artillery has a one-round weapon cooldown; other equipped weapons remain available. Every shot, cooldown and resource check is authoritative.

## Tanks, weapons, and worlds

All ten tanks are unlocked. Original procedural artwork gives each chassis a distinct profile, turret and barrel. Hull, turret and track geometry is shared with server collision so visible body hits count; barrels, antennae and effects are decorative. Effects and synthesized sounds are separate from hit calculations.

| Tank      | Main weapon                                       | Special                                                     |
| --------- | ------------------------------------------------- | ----------------------------------------------------------- |
| TITAN     | Siege Cannon: slow shell, large crater, knockback | Fortify: 55% damage reduction                               |
| PHANTOM   | Shadow Lance: fast, narrow energy strike          | Phase Shift: 65% damage reduction; position stays public    |
| VOLT      | Arc Discharger: chains to two nearby enemies      | EMP Pulse: disables nearby enemy abilities                  |
| INFERNO   | Magma Mortar: burning impact zone                 | Inferno Field: three-round fire zone                        |
| FROSTBITE | Cryo Shard: freezing impact                       | Absolute Zero: nearby enemy movement reduced 70%            |
| VIPER     | Swarm Missiles: three separate flights            | Hunter Lock: five missiles with limited horizontal guidance |
| BASTION   | Rail Piercer: high speed, armor bypass            | Aegis Dome: 40-point shield for self/nearby allies          |
| QUAKE     | Tectonic Shell: wide terrain damage               | Fault Line: directional terrain rupture and path damage     |
| MEDIC-X   | Pulse Repeater: three small plasma pulses         | Repair Field: up to 36 HP to self or valid teammate         |
| NOVA      | Singularity Orb: slow orb, implosion/shockwave    | Overcharge: next attack gains 65% damage, costs 55 energy   |

Shared loadouts include standard shells, three ricochets, two seekers, cryo and incendiary shells. Duplicate weapon types appear once. Ricochets bounce twice; seekers provide limited horizontal guidance. Rail shots ignore armor and penetrate one terrain collision sample; **they do not penetrate multiple tanks**. Hunter Lock automatically guides toward nearby enemies; it does not provide manual target selection. Repair Field has an ally selector in team games. All descriptions and balance values live in shared configuration/ability modules.

| World                | Geometry and authoritative mechanic                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Desert Dunes         | Broad rolling dunes, seeded wind, 20% larger sand craters, stone ruins                                             |
| Frozen Wasteland     | Smooth snow shelves and ice ridges; budgeted 4m drift; heavy/seismic weapons shatter ice cover                     |
| Volcanic Crater      | Central basin; marked lava deals 14 base damage at round end, radius expands every third round                     |
| Jungle Ruins         | Terraced ground; wooden and stone cover blocks shots; incendiary hits ignite wood                                  |
| Alien Planet         | Irregular crystal hills; central 0.55× gravity and outer 1.25× gravity fields                                      |
| Industrial Wasteland | Factory terraces; metal resists ordinary shots, barrels detonate, energy zones deal 9 base damage                  |
| Canyon Clash         | Deep valleys/ridges; seismic impacts add 12 base rockfall damage within 110m                                       |
| Floating Islands     | Disconnected platforms; removing support can cause elimination below the world                                     |
| Toxic Swamp          | Shallow undulating ground; marked pools deal 9 base damage and shrink every fourth round                           |
| Neon City            | Stepped city ground; barriers alternate active rounds, electricity overloads them; energy zones deal 9 base damage |

Hazards apply when a tank center is within the marked radius plus its 12-unit collision allowance at round end. Armor and defensive buffs mitigate hazard damage. Fire zones last three rounds. Lava/toxic/energy map zones last the match. The seed reproduces terrain, cover, wind and spawns. Spawn pads and hazard/cover clearance are validated for 2–8 players; team seats are interleaved. Cover has independent health/material collision, while terrain uses a 4-unit bitmap. Background scenery is decorative. Classic mode retains the earlier map rules; new cover/wind/round-based mechanics apply to simultaneous mode.

## Accounts and statistics

Use the pilot button or **Settings → Pilot account** to register/sign in before entering a room. The server hashes passwords with salted scrypt and stores only SHA-256 digests of randomly generated session tokens. Sessions expire after 30 days. Login/register endpoints are rate limited.

Signed-in pilots get persistent completed-match history, wins, damage, accuracy, and duration in **Settings → View career statistics**. Guests can play without registering, but guest history is not retroactively linked to an account.

By default, accounts and results use an atomic, mode-0600 JSON file at `data/arena.json`. Set `DATABASE_URL` to use PostgreSQL; tables initialize automatically. The Docker deployment uses PostgreSQL and a named persistent volume. Active rooms and in-progress matches are intentionally in memory.

## Architecture

```text
client/src/
  scenes/BattleScene.ts     Phaser scene, procedural world rendering and shot playback
  ui/art.ts                Original procedural tank illustrations
  audio/sound.ts            Synthesized effects and ambient soundtrack
  networking/network.ts    Socket client, acknowledgements and reconnect identity
  main.ts                  Menus, collection, lobby, HUD, results, settings and account UI
  style.css                Existing menus and lobby
  battle.css               Full-viewport responsive combat overlays
  input/BattleControls.ts   Unified pointer, keyboard and joystick input
  effects/weapons.ts        Bounded procedural weapon animation playback
server/src/
  game/engine.ts            Retained classic combat, movement, damage and victory
  game/rounds.ts            Private plans, simultaneous resolution, round bots and timeout rules
  rooms/manager.ts          Membership, room configuration, reconnects, host transfer
  networking/server.ts     HTTP API, Socket.IO validation and isolated broadcasts
  persistence/store.ts     Account/session/history storage: PostgreSQL or atomic JSON
  security/validation.ts   Names, codes and rate limits
  index.ts                 Server lifecycle
shared/src/
  configs/                 Tank, weapon, map and match configurations
  abilities/abilities.ts   Common ability interface and all ten implementations
  physics/projectile.ts    Gravity, substepped collision, ricochet and homing
  maps/terrain.ts          Seeded generation, bitmap collision, craters, RLE snapshots
  maps/environment.ts      Seeded cover, wind, gravity zones and environment rules
  types.ts                 Shared protocol/state types
 tests/                    Vitest engine, lifecycle, persistence and socket integration
```

The simulation is isolated from Socket.IO and rendering. `Game.action()` accepts input commands; `Game.tick()` advances clocks and bots. `RoundGame` extends the preserved movement/victory core with server-private plans and simultaneous round scheduling; the room selects the appropriate engine from `combatFlow`.

### Authoritative networking

Clients submit `move`, `lock`, or `pass` commands in simultaneous mode, or `fire`/`ability` in classic mode with unique command IDs. They never submit hits, damage, terrain edits, or winners. The transport validates exact payload shapes, finite numeric bounds, membership, ownership, and command IDs before the engine checks turns, resources, cooldowns, and inventory.

Rooms use Socket.IO membership and personalized state broadcasts. Reconnect tokens, socket IDs, account IDs, password hashes, and processed-command sets are never included in shared state. Unrevealed plans never enter broadcast state; snapshots include only the requesting pilot’s own plan. A resume token can reclaim only its own seat; a new connection invalidates the old socket's control.

Full RLE-compressed terrain snapshots and authoritative tank state are sent after accepted actions and turn transitions. The client does not reconstruct explosion damage. Snapshots include server time to compensate for browser clock offset. Late joiners cannot enter an ongoing battle; existing pilots can reconnect with a complete snapshot.

Disconnected turns are skipped by default. Host control transfers after 30 seconds. Disconnected lobby seats and wholly abandoned rooms expire after two minutes. An explicit leave during battle forfeits the tank. Commands are bounded to 8 KB; action and room/auth rate limits reject abuse. Deployment defaults to an explicit origin allowlist.

## Tests and validation

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

The tests run a real ephemeral HTTP/Socket.IO server and multiple actual Socket.IO clients. The environment must permit binding to localhost ports. No external service is required for the default suite.

Coverage includes all tank abilities and energy/cooldown restrictions, every weapon's projectile and damage behavior, thin-wall collision, bouncing, armor/shields, healing allies, cluster barrages, overcharge, deterministic maps and valid separated spawns at every player count, craters and settling, timers, friendly fire, FFA and team victory, draws, room passwords/readiness, room isolation, duplicate/malformed/out-of-turn commands, disconnect/reconnect, host transfer, account persistence, complete bot matches, and rematches.

The current upgrade has automated combat/network coverage and a real two-client protocol smoke test. **Browser visual/touch verification was blocked by the available browser tool's URL policy.** Do not interpret the network test as physical-device or visual verification. See `VERIFICATION.md` for the current run record.

Run the same two-client smoke test against a running build or the deployed upgrade:

```sh
node scripts/smoke-multiplayer.mjs http://localhost:3001
npx tsx scripts/smoke-bot-hit.ts http://localhost:3001
node scripts/smoke-multiplayer.mjs https://tank-game-ndgq.onrender.com
```

It creates a temporary private QA room, checks secret planning/reconnection/round transitions/HP/terrain/results, and leaves its seats on completion. It requires protocol 2 at `/api/health`.

To adjust balancing, edit `shared/src/configs/tanks.ts` and `weapons.ts`; no engine rewrite is needed. To format source, run `npm run format`.

## Production without Docker

```sh
npm ci
npm run build
# Node 24 loads the optional .env file directly:
node --env-file-if-exists=.env dist/server/index.js
# Or use exported environment variables:
npm start
```

Open http://localhost:3001. The Node server serves both the compiled frontend and multiplayer API on one origin. Use a process manager or service unit for automatic restarts and a reverse proxy for HTTPS. Build before using `npm start`.

## Render deployment (Recommended over Vercel)

Vercel is designed for serverless frontends and does not support long-lived authoritative WebSocket connections or 60 Hz game simulation loops. Render provides persistent Web Services with full WebSocket support and zero-config single-origin hosting.

### Option 1: Render Blueprint (Automatic)

The existing service is **https://tank-game-ndgq.onrender.com**. Preserve its environment variables and PostgreSQL connection when deploying. The repository includes a [`render.yaml`](render.yaml) blueprint:

1. Push your repository to GitHub / GitLab.
2. Log in to [Render](https://render.com) and go to **Blueprints**.
3. Click **New Blueprint Instance** and select your repository.
4. Render automatically detects `render.yaml` and provisions the Web Service with:
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
   - Health check: `/api/health`
   - Environment variables: `NODE_ENV=production`, `NODE_VERSION=22.14.0`, `TRUST_PROXY=1`
5. Click **Apply**. Once built, open your `https://<service-name>.onrender.com` URL to play.

### Option 2: Manual Web Service setup on Render

1. Go to the [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your repository.
4. Fill in the service details:
   - **Runtime:** `Node`
   - **Build Command:** `npm ci --include=dev && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
5. Under **Advanced** -> **Health Check Path**, enter: `/api/health`
6. Under **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `NODE_VERSION`: `22.14.0`
   - `TRUST_PROXY`: `1`
7. Click **Create Web Service**.

> **Note on Persistence:** On Render's free tier, account credentials and match histories write to `data/arena.json` on an ephemeral disk. To preserve accounts across container spin-downs, create a free PostgreSQL database on Render and set `DATABASE_URL` in the Web Service environment variables.

## Docker deployment

Create an environment file and set a strong database password:

```sh
cp .env.example .env
# Edit .env: POSTGRES_PASSWORD and ALLOWED_ORIGINS.
docker compose up --build -d
docker compose logs -f arena
```

Local production runs at http://localhost:3001. Its port is bound to loopback by default. Accounts/results survive container restarts in the `arena-db` volume. Do not remove that volume unless intentionally deleting persisted data.

### Public HTTPS server

Use a VPS with Docker/Compose, a DNS name pointing to its public IP, and inbound ports 80 and 443 available. Copy this project onto the VPS. Set these in `.env`:

```dotenv
DOMAIN=arena.your-domain.example
POSTGRES_PASSWORD=a-long-unique-random-password
```

Then run:

```sh
docker compose -f docker-compose.yml -f docker-compose.public.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.public.yml logs -f proxy arena
```

Caddy obtains HTTPS certificates, serves the public domain, and proxies WebSocket/polling traffic to the game. The public Compose overlay sets the exact allowed origin and trusts one reverse-proxy hop. The database has no published port.

Open `https://arena.your-domain.example` on two separate devices. Create a room, join through its invitation, ready both pilots, fire, compare craters/health/turns, disconnect/reconnect one device, complete the battle, and rematch. This physical two-device check remains necessary even after the automated public-server protocol smoke test passes.

Back up the database regularly, for example:

```sh
docker compose exec -T db pg_dump -U arena arena > arena-backup.sql
```

Deploy one arena process. Horizontal scaling requires shared room ownership/state plus an appropriate Socket.IO adapter and sticky routing; adding Redis alone does not make the current in-memory simulation distributed.

## Environment variables

| Variable            | Default                       | Purpose                                                                          |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `PORT`              | `3001`                        | HTTP and Socket.IO listening port                                                |
| `ALLOWED_ORIGINS`   | localhost development origins | Comma-separated exact browser origins, including scheme and port                 |
| `DATABASE_URL`      | unset                         | PostgreSQL URL; enables PostgreSQL storage                                       |
| `DATA_FILE`         | `data/arena.json`             | Local persistence file when PostgreSQL is absent                                 |
| `POSTGRES_PASSWORD` | required by Compose           | Database credential; URL-safe characters recommended for the generated URL       |
| `DOMAIN`            | required by public overlay    | DNS name for Caddy automatic HTTPS                                               |
| `TRUST_PROXY`       | unset                         | Set to `1` only behind exactly one trusted reverse proxy; public overlay sets it |
| `NODE_ENV`          | runtime dependent             | Set to `production` for deployment                                               |

Development commands use exported environment variables; they do not silently read `.env`. Docker Compose reads `.env` for interpolation. The explicit `node --env-file-if-exists=.env ...` production command loads it.

## Known limits

- See `VERIFICATION.md` for deployment status. Physical two-device play, orientation changes, touch ergonomics and visual effect quality still require browser/device verification.
- Local JSON storage and the account APIs are tested. PostgreSQL/Compose runtime verification depends on access to a working Docker daemon or PostgreSQL instance; see `VERIFICATION.md`.
- Active matches do not survive a server restart. Existing reconnect tokens recover only a still-running room. The server sends full state snapshots, favoring correctness over bandwidth efficiency.
- Simultaneous and classic modes are available. Spectator joins, ranked queues, distributed room ownership, password reset, email verification and persistent progression are not implemented.
- Accounts are intentionally minimal; the career view retains the most recent 2,000 matches loaded by this process. It is not an unbounded lifetime analytics system.
- Bots use a deterministic angle/power search and automatic ability use. They are competent shooting opponents, not advanced movement/team planners. Balance is an initial tested pass, not a competitive playtest certification.
- Tank art, terrain, animations, sound effects, and background music are procedural. Font assets are bundled locally. The full battlefield is shown instead of a separate minimap; small screens benefit from landscape orientation.
- Simultaneous shots share a frozen post-ability collision board. Cover destroyed by an earlier visual impact still blocks other shots in the same volley. Final HP/terrain commits after all flights. Effects are procedural, without cinematic sprite assets, heat-distortion shaders or a physical rockfall simulation. Reduced motion disables shake; essential projectile playback remains.

## Assets and third-party notices

All tank shapes, UI graphics, environment artwork, and synthesized sound were created for this project; no Tank Stars assets are used. Phaser, Socket.IO, Vite, Express, Zod, pg, and development tools retain their respective licenses. Barlow Condensed and DM Sans are bundled through Fontsource under the SIL Open Font License; license texts are in their installed packages. See `THIRD_PARTY_NOTICES.md`.
