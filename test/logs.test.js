// -----------------------------------------------------------------------------
// What reaches `docker logs`: the lifecycle at info level, everything per check
// or per message at debug level, repeated failures once. And the health checks
// run on the integration's own timer, never on the core polling (Gladys#3198).
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECK_INTERVAL_MS, SCENE_ACTION_KEY } from '../src/app.js';
import { SERVER_STATES } from '../src/history.js';
import { Store } from '../src/store.js';
import { KEY_A, USER_KEY, createFakeBark } from './helpers/fakeBark.js';
import { createWorld } from './helpers/world.js';

/**
 * Captures the lines of the SDK logger (console.log for debug/info,
 * console.error for warn/error), at every level.
 */
function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const lines = [];
  // The SDK logger writes `[time] [LEVEL] [name]` then the arguments.
  const capture = (prefix, ...args) => {
    const [, level, name] = /\[(DEBUG|INFO|WARN|ERROR)\](?: \[([^\]]+)\])?/.exec(prefix) ?? [];
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    lines.push({ level: level?.toLowerCase(), name, text });
  };
  t.mock.method(console, 'log', capture);
  t.mock.method(console, 'error', capture);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    lines,
    at: (...levels) => lines.filter((line) => levels.includes(line.level)).map((l) => l.text),
    clear: () => lines.splice(0),
  };
}

test('the health checks run on their own timer, without any onPoll call', async (t) => {
  captureLogs(t); // keeps the test output quiet
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, [], 'no device: nothing for the core to poll');
  const ack = await world.fake.poll({ external_id: 'bark:anything', features: [] });
  assert.equal(ack.success, false, 'no onPoll handler: the core polling is never relied on');

  const versions = () => world.bark.calls.filter((call) => call.path === '/ping').length;
  const before = versions();
  world.bark.down = 'ECONNREFUSED';
  await world.timers.runAll();
  await world.timers.runAll();
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  world.bark.down = null;
  await world.timers.runAll();
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.equal(versions(), before + 3, 'three checks, driven by the timer alone');
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.deepEqual(
    world.timers.pending.map((timer) => timer.delay),
    [CHECK_INTERVAL_MS],
  );
});

test('a normal cycle writes nothing at info level, and never a key', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(logs.at('info', 'warn', 'error'), [
    'Connected to the Bark server (version 2.4.0)',
  ]);
  logs.clear();

  for (let i = 0; i < 5; i += 1) {
    await world.timers.runAll(); // health checks
  }
  await world.fake.sendMessage({ device_key: USER_KEY }, { text: 'Hello' });
  await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'Door opened' });
  await world.timers.runAll();

  assert.deepEqual(logs.at('info', 'warn', 'error'), []);
  assert.ok(!logs.lines.some((line) => line.text.includes('EXAMPLEkey')), 'no key in the logs');
  assert.ok(![KEY_A, USER_KEY].some((key) => JSON.stringify(logs.lines).includes(key)));
});

test('a server down logs once when it goes, once when it comes back', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.clear();

  world.bark.down = 'ECONNREFUSED';
  for (let i = 0; i < 6; i += 1) {
    await world.timers.runAll();
  }
  assert.deepEqual(logs.at('info', 'warn', 'error'), [
    'The Bark server is offline: Bark does not answer (ECONNREFUSED)',
  ]);
  assert.ok(logs.at('debug').length >= 6, 'each failed check is still there at debug level');

  logs.clear();
  world.bark.down = null;
  await world.timers.runAll();
  await world.timers.runAll();
  assert.deepEqual(logs.at('info', 'warn', 'error'), ['The Bark server is back online']);
});

test('a server down at start says so once, and a restart says where it stands', async (t) => {
  const logs = captureLogs(t);
  const bark = createFakeBark();
  bark.down = 'ENOTFOUND';
  const first = await createWorld({ bark });
  for (let i = 0; i < 4; i += 1) {
    await first.timers.runAll();
  }
  await first.app.stop();
  assert.deepEqual(logs.at('info', 'warn', 'error'), [
    'The Bark server does not answer: Bark does not answer (ENOTFOUND)',
  ]);

  logs.clear();
  bark.down = null;
  const second = await createWorld({ bark, stored: first.store.data });
  t.after(() => second.app.stop());
  await second.timers.runAll();
  assert.deepEqual(logs.at('info', 'warn', 'error'), [
    'Connected to the Bark server (version 2.4.0)',
  ]);
});

test('a connection status Gladys refuses is logged once, and its return once', async (t) => {
  const logs = captureLogs(t);
  const bark = createFakeBark();
  const world = await createWorld({ bark });
  t.after(() => world.app.stop());
  logs.clear();

  let refuse = true;
  const original = world.gladys.setConnectionStatus.bind(world.gladys);
  t.mock.method(world.gladys, 'setConnectionStatus', async (...args) => {
    if (refuse) {
      throw new Error('HTTP 500');
    }
    return original(...args);
  });
  bark.down = 'ECONNREFUSED';
  for (let i = 0; i < 6; i += 1) {
    await world.timers.runAll();
  }
  assert.deepEqual(logs.at('warn', 'error'), [
    'The Bark server is offline: Bark does not answer (ECONNREFUSED)',
    'Cannot publish the connection status: HTTP 500',
  ]);
  logs.clear();
  refuse = false;
  await world.timers.runAll();
  assert.deepEqual(logs.at('info', 'warn', 'error'), ['Connection status published again']);
});

test('a volume that refuses every write is logged once, and its return once', async (t) => {
  const logs = captureLogs(t);
  const directory = await mkdtemp(join(tmpdir(), 'gladys-bark-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // A file where the directory should be: every write fails.
  const blocked = join(directory, 'data');
  await writeFile(blocked, '');
  const store = new Store(blocked);
  for (let i = 0; i < 4; i += 1) {
    await store.save({ i });
  }
  assert.equal(logs.at('warn').length, 1);
  assert.match(logs.at('warn')[0], /^Cannot write /);
  assert.equal(logs.lines.find((line) => line.level === 'warn').name, 'bark-store');

  await rm(blocked);
  await store.save({ i: 5 });
  assert.equal(logs.at('warn').length, 1);
  assert.equal(logs.at('info').length, 1);
  assert.match(logs.at('info')[0], /Writing .* works again$/);
});
