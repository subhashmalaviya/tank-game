# Verification record

Verified locally on 15 October 2026 with Node 24.20.0 and npm 11.19.0.

## Passed

- `npm install`: dependency installation and locked dependency tree.
- `npm test`: **93 passing tests across three files**. The network suite uses a real HTTP/Socket.IO server and independent clients, not a mocked transport. The execution sandbox required local-socket permission for this suite.
- `npm run build`: TypeScript checks, Vite production build, and bundled Node entry point all succeed. Phaser is split into its own cached chunk. Fonts are bundled locally.
- `npm run format:check`: source and configuration formatting passes.
- `npm run dev`: client on 5173, authoritative server on 3001.
- Compiled production runtime: `PORT=3002 ALLOWED_ORIGINS=http://localhost:3002 DATA_FILE=/tmp/tank-arena-production-check.json npm start`. The built frontend loaded, started a solo battle, and accepted movement and firing commands. No browser console errors were observed during these checks.

## Browser walkthroughs

- Desktop menu and procedural Phaser hero at a 1440 × 1000 viewport.
- Solo skirmish: Titan movement reduced its budget, Fortify spent 35 energy and displayed cooldown, firing generated a live path and locked controls until resolution.
- Private room: host created a room, selected Frozen Wasteland, set two players and a 120-second timer, then a second browser tab joined through the invitation URL.
- Both pilots independently selected tanks and readied. Host launched; both clients displayed the same room, tank roster, turn, and shot event.
- Reloading the second browser restored the existing seat and authoritative battle snapshot. With skip-disconnected enabled, a reload during that pilot's turn can advance the turn.
- Forfeiting from the second client generated the winner/results screen on the first client.
- Phone layout at 390 × 844: no horizontal document overflow; battlefield, pilot health, movement, angle, power, weapon, ability, and Fire controls were present.
- Compiled production build played at the phone viewport. Screenshots are stored in `docs/screenshots`.

## Automated scope

- All ten abilities: effects, cost, cooldown, EMP lockout, shields, healing targets and health caps, barrage and overcharge.
- All twelve weapon definitions: finite paths and actual damage; ammo/cooldown enforcement; ricochet, piercing, thin-wall substep collision.
- All ten map themes at every player count from 2 through 8: repeatable seeds, varied seeds, valid separated spawns outside hazards, terrain serialization and crater deformation.
- Turn expiration, out-of-turn rejection, disconnected and eliminated-player skipping, resource regeneration, team protection, team victories, draws and time limits.
- Actual network creation/joining, room passwords, host authorization, readiness, all supported FFA sizes, 2v2/3v3/4v4/2v2v2/2v2v2v2, malformed/duplicate commands, reconnects, cloak filtering, simultaneous room isolation and public queue pairing.
- Complete bot-versus-bot combat driven through the production simulation, followed by rematch and lobby return.
- Account API registration/login and file-store restart persistence; duplicate match recording, host transfer and room expiration.

## Not verified in this environment

- **Docker execution:** the Docker socket denied access under both ordinary and elevated tool execution. The Docker Compose plugin is also unavailable (`docker compose` is not recognized here). The provided Dockerfile and Compose files therefore have not been built/launched on this host.
- **PostgreSQL runtime:** implementation and initialization queries are included, but no accessible database service was available. Default tests validate the atomic JSON storage adapter.
- **Public network/TLS:** no VPS, DNS name, hosting account, or public endpoint was supplied. Public two-device play, reverse-proxy behavior and certificate issuance require deployment using the README instructions.

The application is locally playable. Public deployment and its environment-dependent acceptance checks remain outstanding. See the README's known limits for scope and gameplay tradeoffs.
