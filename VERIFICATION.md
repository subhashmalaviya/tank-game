# Upgrade verification — 2026-10-15

## Audit and checkpoint

- Existing commit: `7b54e792c6eb211c81472db66ba6339fc1330ff9` on `main`, GitHub remote `subhashmalaviya/tank-game`.
- Local rollback archive: `checkpoints/pre-upgrade.tar`; commit recorded in `checkpoints/pre-upgrade-commit.txt`. Both ignored by Git. The supplied UI reference is preserved locally and ignored by Git.
- Preserved Phaser/Vite/TypeScript, Node/Express/Socket.IO, PostgreSQL-or-JSON storage, room protocol, matchmaking, accounts, rematches, Render and Docker configuration.
- Default flow is now simultaneous; the host may explicitly select classic turns.

## Executed checks

- Baseline: 72 logic tests passed; the first network run could not bind loopback (`EPERM`). Reran with loopback permission.
- Vertical slice: 102 tests passed, including two actual Socket.IO clients, private plan snapshots/reconnect, immutable lock, simultaneous lethal draw, wind, heavy shell and shadow lance.
- Expanded suite: 138 tests passed, including ten abilities, ten environmental themes, seeded spawn/cover/hazard clearance at 2–8 players, FFA/team rounds, cooldowns, armor, room isolation, accounts and rematches.
- Production TypeScript/Vite/esbuild compilation passed after fixing a readonly test-fixture type.
- Running-server smoke test passed at `http://localhost:3001`: independent network clients, private room, secrecy, reconnection, lock immutability, both attacks, automatic round-2 broadcast, matching HP/terrain, forfeit result and return to lobby.
- Compiled production-server smoke test passed at `http://localhost:3110`; the built HTML and bundled assets were served successfully.
- `npm run format:check` and `git diff --check` passed.
- Browser visual test was attempted. The browser tool rejected the local tab under its URL policy. No alternative browser-control workaround was used.

## Remaining acceptance gaps

- Desktop/mobile rendered screenshots, actual pointer/joystick gestures, physical touch, orientation changes and readability have not been visually verified for this upgrade.
- Two separate physical devices have not been tested. Multiple protocol clients are not a substitute for that acceptance check.
- PostgreSQL and Docker runtime tests were not repeated in this upgrade. Their configuration and persistence implementation were preserved.
- No claim of competitive balance or mobile performance certification. Art/audio/effects are original procedural implementations.

## Deployment

Release implementation is committed locally as `b53c1d3`, followed by the final viewport/documentation correction. `git push origin main` was attempted and failed: `could not read Username for 'https://github.com': No such device or address`. GitHub authentication is required before publishing. No token was requested in chat or added to the repository.

**The live Render service has not been upgraded.** Its pre-upgrade health endpoint was reachable and returned `{"ok":true,"rooms":0}`. After authenticated `git push origin main`, verify Render auto-deploy completes (or trigger Deploy latest commit in its dashboard), check `/api/health` for `protocol: 2` and `build: "simultaneous-overlays-v2"`, then run:

```sh
node scripts/smoke-multiplayer.mjs https://tank-game-ndgq.onrender.com
```

The public-server smoke test remains pending deployment. Existing Render configuration and secrets were not changed.

## Main changed files

- `client/src/main.ts`, `battle.css`, `input/BattleControls.ts`: full-screen HUD, responsive overlays, unified input and lobby flow selection.
- `client/src/scenes/BattleScene.ts`, `effects/weapons.ts`, `ui/art.ts`, `audio/sound.ts`: synchronized flight/impact playback, tank silhouettes, statuses, original effects and audio.
- `server/src/game/rounds.ts`: private plans, aggregate simultaneous damage, round transitions, bots, reconnect/forfeit handling.
- `server/src/game/engine.ts`, `rooms/manager.ts`, `networking/server.ts`: classic compatibility, room engine selection, movement/cooldown rules and health build marker.
- `shared/src/types.ts`, `configs/*`, `abilities/abilities.ts`, `physics/projectile.ts`, `maps/*`: protocol, tank/weapon balance, abilities, collision, seeded environment and terrain profiles.
- `tests/simultaneous.test.ts`, `environment-rounds.test.ts`, existing regression suites: server-rule coverage.
- `scripts/smoke-multiplayer.mjs`: reproducible two-client deployed-protocol check.
- `README.md`, `.gitignore`, `VERIFICATION.md`: controls, rules, setup/deployment and rollback/verification record.

## Follow-up: visible bot hits and health feedback

- Reproduced three failing cases before the fix: a shot through the drawn turret missed the old 36×28 collision rectangle and caused no damage in either classic or simultaneous combat.
- Shared hull/turret/track geometry now drives both artwork and authoritative collision for all ten tanks.
- Both combat modes replay confirmed damage on HUD and tank health bars at impact time; simultaneous mode retains atomic server-side round resolution. Shield absorption is included in events and labeled instead of silently hiding a blocked hit.
- Added `tests/hit-feedback.test.ts` covering turret hits, ten silhouettes, immutable snapshots, impact-time HP feedback and shield absorption.
- Final follow-up validation: **155 tests passed**, production build passed, and two-client multiplayer smoke test passed against the running local server.
- Actual AI-bot smoke test (`npx tsx scripts/smoke-bot-hit.ts http://localhost:3001`) passed: Shadow Lance reduced a VIPER bot from **98 HP to 63 HP**, reporting **35 damage** and **0 shield absorption**.
