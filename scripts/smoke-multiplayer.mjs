import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
const url = process.argv[2] || 'http://localhost:3001';
const sockets = [];
const req = (s, event, data = {}) =>
  new Promise((resolve, reject) =>
    s.timeout(12000).emit(event, data, (err, r) => (err ? reject(err) : resolve(r))),
  );
const connect = async () => {
  const s = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 20000,
  });
  sockets.push(s);
  await new Promise((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
};
const awaitState = (s, predicate) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('state', fn);
      reject(new Error('State transition timed out'));
    }, 35000);
    const fn = (state) => {
      if (predicate(state)) {
        clearTimeout(timer);
        s.off('state', fn);
        resolve(state);
      }
    };
    s.on('state', fn);
  });
let a, b;
try {
  const health = await fetch(url + '/api/health').then((r) => r.json());
  assert.equal(health.protocol, 2, 'Upgrade is not deployed at this URL');
  a = await connect();
  b = await connect();
  const created = await req(a, 'create', { name: 'QA Alpha' });
  assert.equal(created.ok, true);
  const code = created.room.code;
  assert.equal((await req(b, 'join', { code, name: 'QA Bravo' })).ok, true);
  assert.equal(
    (
      await req(a, 'configure', {
        ...created.room.config,
        maxPlayers: 2,
        map: 'desert',
        turnSeconds: 120,
        combatFlow: 'simultaneous',
      })
    ).ok,
    true,
  );
  await req(a, 'select', { tank: 'titan', team: 0 });
  await req(b, 'select', { tank: 'phantom', team: 1 });
  await req(a, 'ready', true);
  await req(b, 'ready', true);
  const started = awaitState(b, (s) => s.match?.phase === 'planning');
  assert.equal((await req(a, 'start')).ok, true);
  await started;
  const sealed = awaitState(b, (s) => s.match?.readyIds.length === 1);
  assert.equal(
    (
      await req(a, 'command', {
        id: 'qa-lock-a',
        command: { type: 'lock', round: 1, angle: 37, power: 69, weapon: 'heavy', ability: true },
      })
    ).ok,
    true,
  );
  const privateView = (await sealed).match;
  assert.equal(privateView.ownPlan, undefined);
  assert.equal(privateView.shots.length, 0);
  const hidden = privateView.fighters.find((f) => f.id === created.playerId);
  assert.equal(hidden.angle, 90);
  assert.equal(hidden.power, 0);
  assert.deepEqual(hidden.weapons, {});
  assert.equal(hidden.energy, 100);
  const recovered = await connect();
  const resumed = await req(recovered, 'resume', { code, token: created.token });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.room.match.ownPlan.power, 69);
  a.disconnect();
  a = recovered;
  assert.equal(
    (
      await req(a, 'command', {
        id: 'qa-illegal-edit',
        command: { type: 'move', direction: 1, distance: 5 },
      })
    ).ok,
    false,
  );
  const revealing = awaitState(a, (s) => s.match?.phase === 'resolving');
  const nextA = awaitState(a, (s) => s.match?.turn === 2);
  const nextB = awaitState(b, (s) => s.match?.turn === 2);
  assert.equal(
    (
      await req(b, 'command', {
        id: 'qa-lock-b',
        command: { type: 'lock', round: 1, angle: 143, power: 69, weapon: 'shadow', ability: true },
      })
    ).ok,
    true,
  );
  const volley = (await revealing).match;
  assert.equal(new Set(volley.shots.map((s) => s.owner)).size, 2);
  assert.deepEqual(
    volley.shots.map((s) => s.weapon),
    ['heavy', 'shadow'],
  );
  const [stateA, stateB] = await Promise.all([nextA, nextB]);
  assert.deepEqual(stateA.match.terrain, stateB.match.terrain);
  assert.deepEqual(
    stateA.match.fighters.map((f) => f.hp),
    stateB.match.fighters.map((f) => f.hp),
  );
  assert.deepEqual(stateA.match.readyIds, []);
  const finished = awaitState(a, (s) => s.phase === 'results');
  assert.equal((await req(b, 'leave')).ok, true);
  assert.deepEqual((await finished).match.result.winnerIds, [created.playerId]);
  assert.equal((await req(a, 'lobby')).ok, true);
  console.log(
    JSON.stringify({
      ok: true,
      url,
      build: health.build,
      checks: [
        'two independent clients',
        'private room',
        'sealed choices hidden',
        'reconnect own plan',
        'immutable lock',
        'both weapons revealed',
        'round 2 broadcast',
        'identical HP and terrain',
        'forfeit result',
        'return to lobby',
      ],
    }),
  );
} finally {
  for (const s of sockets) {
    if (s.connected) await req(s, 'leave').catch(() => {});
    s.disconnect();
  }
}
