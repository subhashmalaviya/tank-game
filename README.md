# Tank Arena: Chaos Wars

An original, playable multiplayer artillery game built with **Phaser 3, TypeScript, Vite, Node.js, and Socket.IO**. Ten procedurally illustrated tanks, ten seeded worlds, destructible bitmap terrain, authoritative turn-based combat, private rooms, team battles, bots, reconnection, accounts, and match history.

## Run it

Prerequisites: **Node.js 24+ and npm 11+**. Docker with the Compose plugin is optional. You do not need PostgreSQL for local development.

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

## Controls

| Action            | Desktop                                                | Touch                           |
| ----------------- | ------------------------------------------------------ | ------------------------------- |
| Move              | A / D, or arrow buttons                                | Left/right buttons              |
| Aim               | Left/right arrow keys, click battlefield, angle slider | Tap battlefield or angle slider |
| Power             | W / S, power slider                                    | Power slider                    |
| Fire              | Space or Fire                                          | Fire                            |
| Ability           | E or ability button                                    | Ability button                  |
| Change ammunition | Loadout dropdown                                       | Loadout dropdown                |

Angles run from 5° (right) to 175° (left); 90° points upward. The dotted arc previews the initial trajectory. A shot ends a turn after a 2.4-second animation window. The server computes the complete flight before sending the outcome. Projectiles in a volley are resolved in deterministic order and their playback is staggered.

Movement consumes a per-turn distance budget. Steep walls, other tanks, and gaps block horizontal movement. Gravity settles unsupported tanks after explosions. Long falls cause damage; falling off an island eliminates a tank. Friendly-fire protection covers weapon/status damage from allies; terrain changes remain shared, so destroying an ally's support can still be dangerous.

Abilities cost energy and impose cooldowns. Pilots regain 18 energy at the beginning of their next turns. Shields absorb a fixed damage pool; Fortify reduces incoming damage. EMP blocks abilities, Freeze reduces movement by 70%, and burning causes damage on the affected pilot's turns. Cloak hides coordinates from opposing client snapshots and disables homing/bot targeting until it expires or the tank fires. It does not protect against blind splash damage.

## Tanks, weapons, and worlds

All ten tanks are unlocked; rarity is an informational collection category, with no purchases or progression gate.

| Tank      | Role               | Main weapon                      | Ability              |
| --------- | ------------------ | -------------------------------- | -------------------- |
| TITAN     | Heavy assault      | Heavy shell                      | Fortify              |
| PHANTOM   | Stealth precision  | Standard shell with damage bonus | Cloak                |
| VOLT      | Electric disruptor | Arc bolt / chain damage          | EMP                  |
| INFERNO   | Area denial        | Incendiary shell                 | Burning Ground       |
| FROSTBITE | Crowd control      | Cryo shell                       | Freeze               |
| VIPER     | Artillery          | Three-missile cluster            | Five-missile barrage |
| BASTION   | Defensive support  | Piercing cannon                  | Energy Shield        |
| QUAKE     | Terrain engineer   | Seismic shell                    | Earthshaker          |
| MEDIC-X   | Team support       | Plasma pulse                     | Repair Pulse         |
| NOVA      | Glass cannon       | Charged plasma                   | Overcharge           |

Every tank also carries a standard shell, three ricochets, and two seeker missiles. Ricochets bounce twice; seekers provide limited horizontal homing; piercing shells ignore armor and penetrate an additional collision sample. Ammo and cooldowns are server-enforced. Medic can select a living nearby ally in team mode. Range-limited offensive abilities automatically select the nearest eligible enemy.

The ten map themes are Desert Dunes, Frozen Wasteland, Volcanic Crater, Jungle Ruins, Alien Planet, Industrial Wasteland, Canyon Clash, Floating Islands, Toxic Swamp, and Neon City. Themes vary terrain roughness, palette, scenery, gravity, ice drift, separated platforms, and hazards. Alien terrain includes a central low-gravity field. Terrain, collision, and generated cover share a 4-world-unit bitmap. Scenery drawn above terrain is decorative; it is not a separate destructible building simulation.

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
  style.css                Responsive desktop and touch layouts
server/src/
  game/engine.ts            Authoritative combat, bots, turns, damage and victory
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
  types.ts                 Shared protocol/state types
 tests/                    Vitest engine, lifecycle, persistence and socket integration
```

The simulation is isolated from Socket.IO and rendering. `Game.action()` accepts input commands; `Game.tick()` advances clocks and bots. A future simultaneous-action ruleset can reuse the physics, terrain, weapon, and ability modules while replacing turn scheduling.

### Authoritative networking

Clients submit `move`, `fire`, `ability`, or `pass` commands with unique command IDs. They never submit hits, damage, terrain edits, or winners. The transport validates exact payload shapes, finite numeric bounds, membership, ownership, and command IDs before the engine checks turns, resources, cooldowns, and inventory.

Rooms use Socket.IO membership and personalized state broadcasts. Reconnect tokens, socket IDs, account IDs, password hashes, and processed-command sets are never included in shared state. Enemy cloak positions are filtered. A resume token can reclaim only its own seat; a new connection invalidates the old socket's control.

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

Development verification was staged around the combat core, tank/map rules, network integration, and browser play. Browser checks cover the real rendered menu, a solo battle with movement/ability/shooting, private-room flow, and mobile layout. See `VERIFICATION.md` for the final run record and deployment checks that remain environment-dependent.

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

Open `https://arena.your-domain.example` on two separate devices. Create a room, join through its invitation, ready both pilots, fire, compare craters/health/turns, disconnect/reconnect one device, complete the battle, and rematch. This is the final public-network acceptance check; a running public deployment is not included in the source delivery.

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

- The delivered code runs locally; no public host/domain was provided or deployed. Two-device internet play and TLS must be verified after deployment.
- Local JSON storage and the account APIs are tested. PostgreSQL/Compose runtime verification depends on access to a working Docker daemon or PostgreSQL instance; see `VERIFICATION.md`.
- Active matches do not survive a server restart. Existing reconnect tokens recover only a still-running room. The server sends full state snapshots, favoring correctness over bandwidth efficiency.
- Combat is turn-based. Spectator joins, simultaneous-action play, ranked queues, accounts across multiple running server instances, password reset, email verification, and persistent progression are not implemented.
- Accounts are intentionally minimal; the career view retains the most recent 2,000 matches loaded by this process. It is not an unbounded lifetime analytics system.
- Bots use a deterministic angle/power search and automatic ability use. They are competent shooting opponents, not advanced movement/team planners. Balance is an initial tested pass, not a competitive playtest certification.
- Tank art, terrain, animations, sound effects, and background music are procedural. Font assets are bundled locally. The full battlefield is shown instead of a separate minimap; small screens benefit from landscape orientation.
- Shot outcomes are computed immediately on the server, then animated. HP/crater state can appear before the last visual particle resolves. Projectile trails and impacts are cosmetic playback of authoritative paths.

## Assets and third-party notices

All tank shapes, UI graphics, environment artwork, and synthesized sound were created for this project; no Tank Stars assets are used. Phaser, Socket.IO, Vite, Express, Zod, pg, and development tools retain their respective licenses. Barlow Condensed and DM Sans are bundled through Fontsource under the SIL Open Font License; license texts are in their installed packages. See `THIRD_PARTY_NOTICES.md`.
