import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { projectile } from '../shared/src/physics/projectile';
import { Terrain } from '../shared/src/maps/terrain';
import { mapById } from '../shared/src/configs/maps';
import { WEAPONS } from '../shared/src/configs/weapons';
import type { Reply, RoomState } from '../shared/src/types';
const url = process.argv[2] ?? 'http://localhost:3001';
const socket = io(url, { transports: ['websocket'], reconnection: false });
const request = (event: string, data: unknown = {}): Promise<Reply> =>
  new Promise((resolve, reject) =>
    socket
      .timeout(10000)
      .emit(event, data, (err: Error | null, r: Reply) =>
        err ? reject(err) : r.ok ? resolve(r) : reject(new Error(r.error)),
      ),
  );
const wait = (matches: (state: RoomState) => boolean): Promise<RoomState> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('state', listener);
      reject(new Error('Bot smoke test timed out'));
    }, 35000);
    function listener(s: RoomState) {
      if (matches(s)) {
        clearTimeout(timer);
        socket.off('state', listener);
        resolve(s);
      }
    }
    socket.on('state', listener);
  });
try {
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  const created = await request('create', { name: 'QA Bot Hit' });
  await request('configure', {
    ...created.room!.config,
    combatFlow: 'simultaneous',
    maxPlayers: 2,
    bots: 1,
    map: 'desert',
    turnSeconds: 120,
  });
  await request('select', { tank: 'phantom', team: 0 });
  await request('ready', true);
  const started = wait((s) => s.match?.phase === 'planning');
  await request('start');
  const state = (await started).match!,
    me = state.fighters.find((f) => f.id === created.playerId)!,
    bot = state.fighters.find((f) => f.bot)!,
    terrain = Terrain.unpack(state.terrain);
  let plan: { angle: number; power: number } | undefined;
  for (let angle = 5; angle <= 175 && !plan; angle++)
    for (let power = 10; power <= 100; power++) {
      const shot = projectile(
        me,
        angle,
        power,
        WEAPONS.shadow,
        mapById(state.map).gravity,
        terrain,
        state.fighters,
        me.id,
        false,
        state.environment,
      );
      if (shot.directId === bot.id) {
        plan = { angle, power };
        break;
      }
    }
  assert.ok(plan, 'Could not find a direct shot on this generated map');
  const reveal = wait((s) => s.match?.phase === 'resolving'),
    next = wait((s) => !!s.match && (s.match.turn > 1 || !!s.match.result));
  await request('command', {
    id: 'qa-bot-hit',
    command: { type: 'lock', round: 1, weapon: 'shadow', ...plan, ability: false },
  });
  const shot = (await reveal).match!.shots.find((s) => s.owner === me.id)!,
    hit = shot.damage.find((d) => d.id === bot.id);
  assert.ok(hit, 'Server must report the predicted direct hit');
  assert.ok(hit.amount > 0 || (hit.absorbed ?? 0) > 0, 'Hit must damage health or a shield');
  const after = (await next).match!.fighters.find((f) => f.id === bot.id)!;
  assert.ok(
    after.hp < bot.hp || (hit.absorbed ?? 0) > 0,
    'Bot health must decrease unless the shield absorbed the hit',
  );
  console.log(
    JSON.stringify({
      ok: true,
      url,
      bot: bot.tank,
      weapon: 'shadow',
      hpBefore: bot.hp,
      hpAfter: after.hp,
      damage: hit.amount,
      absorbed: hit.absorbed ?? 0,
    }),
  );
} finally {
  if (socket.connected) await request('leave').catch(() => {});
  socket.disconnect();
}
