// -----------------------------------------------------------------------------
// The whole integration against the fake Gladys of the SDK and an in-memory
// Bark server answering like the real one.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  ACTION_KEY,
  ActionFailure,
  CHECK_INTERVAL_MS,
  FAILURE_EVENT_INTERVAL_MS,
  MESSAGE_TIMEOUT_MS,
  RECHECK_DELAY_MS,
  SCENE_ACTION_KEY,
  TRIGGERS,
} from '../src/app.js';
import { SERVER_STATES } from '../src/history.js';
import { ERROR_TEXT } from '../src/texts.js';
import { TEST_ACTION, WIDGET_KEY } from '../src/widgets.js';
import { GONE_KEY, KEY_A, KEY_B, USER_KEY, createFakeBark } from './helpers/fakeBark.js';
import { BASE_CONFIG, createWorld } from './helpers/world.js';

const events = (fake, key) => fake.sceneEvents.filter((event) => event.key === key);

test('connecting checks the server and reports it connected', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.equal(world.app.history.server.version, '2.4.0');
  assert.deepEqual(world.fake.sceneEvents, [], 'the first known state is not a transition');
  assert.deepEqual(
    world.timers.pending.map((timer) => timer.delay),
    [CHECK_INTERVAL_MS],
  );
  assert.deepEqual(world.fake.discoveredDevices, [], 'a communication integration has no device');
});

test('an empty address means the official server, a wrong one is said on the status', async (t) => {
  const world = await createWorld({ config: { server_url: 'ftp://example.com' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: ERROR_TEXT.invalid_url,
  });
  assert.equal(world.bark.calls.length, 0);
  await world.fake.configUpdated({ server_url: '' });
  assert.equal(world.bark.calls[0].url, 'https://api.day.app/ping');
});

test('a Gladys message goes to the key and level of the user', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, default_level: 'passive' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sendMessage(
    { device_key: `https://api.day.app/${USER_KEY}/`, level: 'timeSensitive' },
    { text: 'The **washing machine** is done', file: null },
  );
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(world.bark.pushes, [
    {
      title: 'Gladys',
      body: 'The **washing machine** is done',
      level: 'timeSensitive',
      group: 'Gladys',
      device_key: USER_KEY,
    },
  ]);
  const post = world.bark.calls.find((call) => call.method === 'POST');
  assert.equal(post.timeoutMs, MESSAGE_TIMEOUT_MS);
  assert.equal(post.path, '/push', 'the key never travels in the URL');
});

test('a user level left to default takes the level of the configuration', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, default_level: 'passive' } });
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ device_key: USER_KEY, level: 'default' }, { text: 'Hi' });
  assert.equal(world.bark.pushes[0].level, 'passive');
});

test('a camera image is replaced by a line, in the configured language', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, language: 'fr' } });
  t.after(() => world.app.stop());
  await world.fake.sendMessage(
    { device_key: USER_KEY },
    { text: 'Mouvement', file: 'image/png;base64,AAAA' },
  );
  assert.match(world.bark.pushes[0].body, /^Mouvement\n\nImage non transmise/);
});

test('an encrypted message hides the texts, keeps the level readable', async (t) => {
  const key = 'EXAMPLE-aes-key-0123456789abcdef'; // 32 characters: AES-256
  const world = await createWorld({ config: { ...BASE_CONFIG, encryption_key: key } });
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ device_key: USER_KEY, level: 'critical' }, { text: 'Secret' });
  const [push] = world.bark.pushes;
  assert.equal(push.level, 'critical');
  assert.equal(push.body, undefined);
  assert.equal(push.title, undefined);
  assert.match(push.iv, /^[A-Za-z0-9]{16}$/);
  const { createDecipheriv } = await import('node:crypto');
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(push.iv));
  const clear = Buffer.concat([decipher.update(push.ciphertext, 'base64'), decipher.final()]);
  assert.deepEqual(JSON.parse(clear.toString('utf8')), { title: 'Gladys', body: 'Secret' });
});

test('a wrong encryption key is a configuration error, said on the status', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, encryption_key: 'short' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: ERROR_TEXT.bad_encryption_key,
  });
  const ack = await world.fake.sendMessage({ device_key: USER_KEY }, { text: 'x' });
  assert.equal(ack.success, false);
  assert.equal(world.bark.pushes.length, 0, 'never sent in clear');
});

test('an unknown key fails the message, fires the trigger once per 15 minutes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const wrong = 'EXAMPLEkeyWRONGWRONGWR';
  const first = await world.fake.sendMessage({ device_key: wrong }, { text: 'a' });
  assert.equal(first.success, false);
  assert.match(first.error, /device key unknown/);
  assert.ok(!first.error.includes(wrong), 'the key is not in the error');
  assert.deepEqual(events(world.fake, TRIGGERS.FAILED), [
    {
      key: TRIGGERS.FAILED,
      data: { reason: 'key', origin: 'gladys_message', error: ERROR_TEXT.unknown_key.en },
    },
  ]);

  // A key Apple refuses: the same reason, still within 15 minutes.
  const gone = await world.fake.sendMessage({ device_key: GONE_KEY }, { text: 'b' });
  assert.match(gone.error, /Apple no longer knows/);
  assert.equal(events(world.fake, TRIGGERS.FAILED).length, 1);

  world.clock.time = new Date(world.clock.time.getTime() + FAILURE_EVENT_INTERVAL_MS);
  await world.fake.sendMessage({ device_key: wrong }, { text: 'c' });
  assert.equal(events(world.fake, TRIGGERS.FAILED).length, 2);
  assert.equal(world.app.history.today().failed, 3);
});

test('the scene action sends a full notification to every key and returns its outputs', async (t) => {
  const world = await createWorld({
    config: { ...BASE_CONFIG, device_keys: `${KEY_A}, ${KEY_B}` },
  });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction(SCENE_ACTION_KEY, {
    title: 'Front door',
    subtitle: 'Entrance',
    message: 'Opened while away',
    level: 'critical',
    sound: 'alarm',
    call: true,
    group: 'Security',
    url: 'https://example.com/camera',
    image: 'https://example.com/snapshot.jpg',
    icon: '',
  });
  assert.deepEqual(ack, {
    success: true,
    data: { outputs: { delivered: true, sent_count: 2, error: '' } },
  });
  assert.deepEqual(
    world.bark.pushes.map((push) => push.device_key),
    [KEY_A, KEY_B],
  );
  const { device_key: _key, ...push } = world.bark.pushes[0];
  assert.deepEqual(push, {
    title: 'Front door',
    subtitle: 'Entrance',
    body: 'Opened while away',
    level: 'critical',
    sound: 'alarm',
    group: 'Security',
    url: 'https://example.com/camera',
    image: 'https://example.com/snapshot.jpg',
    call: '1',
  });
  assert.equal(world.app.history.data.recent[0].title, 'Front door');
  assert.equal(world.app.history.data.recent[0].level, 'critical');
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('a scene notification that fails is an output, a wrong field fails the action', async (t) => {
  const bark = createFakeBark();
  const world = await createWorld({
    bark,
    config: { ...BASE_CONFIG, device_keys: `${KEY_A},${GONE_KEY}` },
  });
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x' });
  assert.deepEqual(ack.data.outputs, {
    delivered: false,
    sent_count: 1,
    error: ERROR_TEXT.device_gone.en,
  });

  bark.down = 'ECONNREFUSED';
  ack = await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'y' });
  assert.deepEqual(ack.data.outputs, {
    delivered: false,
    sent_count: 0,
    error: ERROR_TEXT.unreachable.en,
  });
  assert.equal(world.app.history.data.recent[0].delivered, false);
  assert.deepEqual(
    events(world.fake, TRIGGERS.FAILED).map((event) => event.data.reason),
    ['key', 'unreachable'],
  );

  const invalid = await world.fake.sceneAction(SCENE_ACTION_KEY, {
    message: 'x',
    url: 'javascript:alert(1)',
  });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /only http/);
});

test('the scene action without any key: an output, not a crash', async (t) => {
  const world = await createWorld({ config: { ...BASE_CONFIG, device_keys: '' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x' });
  assert.deepEqual(ack.data.outputs, {
    delivered: false,
    sent_count: 0,
    error: ERROR_TEXT.no_key.en,
  });
  assert.equal(events(world.fake, TRIGGERS.FAILED)[0].data.reason, 'key');
});

test('the test action succeeds in green, in the four languages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true);
  assert.deepEqual(Object.keys(ack.data.message), ['en', 'fr', 'de', 'es']);
  assert.equal(
    ack.data.message.en,
    'Bark server 2.4.0 answers. Test notification sent to 1 device(s).',
  );
  assert.equal(world.bark.pushes[0].title, 'Gladys test');
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('the test action fails in red: no key, a refused key, a server down', async (t) => {
  const bark = createFakeBark();
  const world = await createWorld({ config: { ...BASE_CONFIG, device_keys: '' }, bark });
  t.after(() => world.app.stop());
  let ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /aucune clé d'appareil/);
  assert.equal(world.bark.pushes.length, 0);

  await world.fake.configUpdated({ ...BASE_CONFIG, device_keys: `${KEY_A} ${GONE_KEY}` });
  ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, false);
  assert.match(ack.error.en, /sent to 1 of 2 devices/);

  bark.down = 'ECONNREFUSED';
  ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, false);
  assert.equal(ack.error.en, 'Bark cannot be reached: the Bark server does not answer.');
  assert.equal(ack.error.fr, 'Bark est injoignable : le serveur Bark ne répond pas.');
  assert.ok(new ActionFailure({ en: 'x' }) instanceof Error);
});

test('the widget settings hide the list and the test button', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { show_recent: false, show_test_button: false },
    language: 'en',
    units: 'metric',
  });
  const content = ack.data.content ?? ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['status'],
  );
});

test('offline after two failed checks, back online on the next good one', async (t) => {
  const bark = createFakeBark();
  const world = await createWorld({ bark });
  t.after(() => world.app.stop());

  bark.down = 'ECONNREFUSED';
  await world.timers.runAll(); // the 5-minute check fails once
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE, 'one failure is a blip');
  assert.deepEqual(
    world.timers.pending.map((timer) => timer.delay),
    [RECHECK_DELAY_MS],
  );

  await world.timers.runAll(); // the recheck 30 s later fails too
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  assert.deepEqual(events(world.fake, TRIGGERS.OFFLINE), [
    { key: TRIGGERS.OFFLINE, data: { error: ERROR_TEXT.unreachable.en } },
  ]);
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: ERROR_TEXT.unreachable,
  });

  await world.timers.runAll(); // still down: no second event
  assert.equal(events(world.fake, TRIGGERS.OFFLINE).length, 1);

  bark.down = null;
  await world.timers.runAll();
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.deepEqual(events(world.fake, TRIGGERS.ONLINE), [
    { key: TRIGGERS.ONLINE, data: { version: '2.4.0' } },
  ]);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a message delivered while offline brings the server back at once', async (t) => {
  const bark = createFakeBark();
  const world = await createWorld({ bark });
  t.after(() => world.app.stop());
  bark.down = 'ECONNREFUSED';
  await world.timers.runAll();
  await world.timers.runAll();
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  bark.down = null;
  await world.fake.sendMessage({ device_key: USER_KEY }, { text: 'hello' });
  await world.app.check();
  assert.equal(world.app.history.server.state, SERVER_STATES.ONLINE);
  assert.equal(events(world.fake, TRIGGERS.ONLINE).length, 1);
});

test('a restart neither forgets nor repeats a transition', async (t) => {
  const bark = createFakeBark();
  // First run: the server was online, then went down.
  const first = await createWorld({ bark });
  bark.down = 'ECONNREFUSED';
  await first.timers.runAll();
  await first.timers.runAll();
  await first.app.stop();
  assert.equal(events(first.fake, TRIGGERS.OFFLINE).length, 1);

  // Restart while it is still down: no new "offline" event…
  const second = await createWorld({ bark, stored: first.store.data });
  t.after(() => second.app.stop());
  await second.timers.runAll();
  assert.deepEqual(second.fake.sceneEvents, []);
  // …and its return is still announced.
  bark.down = null;
  await second.timers.runAll();
  assert.equal(events(second.fake, TRIGGERS.ONLINE).length, 1);
});

test('a first failed check after installation announces nothing', async (t) => {
  const bark = createFakeBark();
  bark.down = 'ENOTFOUND';
  const world = await createWorld({ bark });
  t.after(() => world.app.stop());
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.fake.connectionStatus.connected, false);
});

test('a new address forgets the state of the previous server', async (t) => {
  const bark = createFakeBark();
  const world = await createWorld({ bark });
  t.after(() => world.app.stop());
  bark.down = 'ECONNREFUSED';
  await world.fake.configUpdated({ ...BASE_CONFIG, server_url: 'http://192.0.2.20' });
  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE);
  assert.deepEqual(world.fake.sceneEvents, [], 'not the same server: not a transition');
  assert.equal(world.timers.pending.length, 1, 'one timer only');
  assert.ok(!JSON.stringify(world.store.data).includes('192.0.2'), 'no address stored');
});

test('the widget lists scene notifications only, within the budget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ device_key: USER_KEY }, { text: 'Personal message for one user' });
  await world.fake.sceneAction(SCENE_ACTION_KEY, {
    message: 'Garage left open',
    level: 'critical',
  });

  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language, units: 'metric' });
    assert.equal(ack.success, true);
    const content = ack.data.content ?? ack.data;
    assert.deepEqual(validateWidgetContent(content), [], language);
    const json = JSON.stringify(content);
    assert.ok(json.includes('Garage left open'));
    assert.ok(!json.includes('Personal message'), 'a message to one user is never listed');
  }
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: {},
    language: 'en',
    units: 'metric',
  });
  const content = ack.data.content ?? ack.data;
  const status = content.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Bark server', 'Online (2.4.0)'],
      ['Sent today', 2],
      ['Failed today', 0],
    ],
  );
});

test('the widget when nothing was sent yet, and its test button', async (t) => {
  const world = await createWorld({ config: { server_url: 'ftp://example.com' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: {},
    language: 'fr',
    units: 'metric',
  });
  const content = ack.data.content ?? ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['status', 'text', 'button'],
  );
  assert.equal(content.components[0].items[0].value, 'Non configuré');

  const toast = await world.fake.widgetAction(WIDGET_KEY, TEST_ACTION, {}, { settings: {} });
  assert.equal(toast.success, false, 'not configured: the toast is red');
  for (const text of Object.values(toast.error)) {
    assert.ok(text.length <= 200);
  }
  const unknown = await world.fake.widgetAction(WIDGET_KEY, 'nope', {}, { settings: {} });
  assert.equal(unknown.success, false);
});

test('the counters restart at local midnight', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.sendMessage({ device_key: USER_KEY }, { text: 'x' });
  assert.equal(world.app.history.today().sent, 1);
  world.clock.time = new Date(world.clock.time.getTime() + 24 * 3600 * 1000);
  assert.equal(world.app.history.today().sent, 0);
});

test('stop clears the timer and stops checking', async () => {
  const world = await createWorld();
  await world.app.stop();
  assert.deepEqual(world.timers.pending, []);
  const calls = world.bark.calls.length;
  await world.app.check();
  assert.equal(world.bark.calls.length, calls);
});

test('nothing secret is stored, nor in the status, the events or the logs', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.sceneAction(SCENE_ACTION_KEY, { message: 'x' });
  await world.fake.sendMessage({ device_key: 'EXAMPLEkeyWRONGWRONGWR' }, { text: 'y' });
  const everything = JSON.stringify([
    world.store.data,
    world.fake.connectionStatuses,
    world.fake.sceneEvents,
  ]);
  assert.ok(!everything.includes('EXAMPLEkey'));
});

test('a check of the previous server ending after a new address is ignored', async (t) => {
  // Server A answers, server B (192.0.2.40) is down.
  const bark = createFakeBark();
  const request = async (url, options) => {
    if (url.startsWith('http://192.0.2.40')) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    return bark.request(url, options);
  };
  const world = await createWorld({
    bark: { ...bark, request },
    config: { ...BASE_CONFIG, server_url: 'http://192.0.2.40' },
  });
  t.after(() => world.app.stop());

  // The check of A succeeds, then hangs while reporting to Gladys…
  let release;
  const original = world.gladys.setConnectionStatus.bind(world.gladys);
  t.mock.method(world.gladys, 'setConnectionStatus', async (...args) => {
    if (!release) {
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    return original(...args);
  });
  const switchToA = world.fake.configUpdated({ ...BASE_CONFIG, server_url: 'http://192.0.2.30' });
  for (let i = 0; i < 50 && !release; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(release, 'the check of A is reporting');
  // …while the user switches back to B.
  const switchToB = world.fake.configUpdated({ ...BASE_CONFIG, server_url: 'http://192.0.2.40' });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([switchToA, switchToB]);
  await world.app.check();

  assert.equal(world.app.history.server.state, SERVER_STATES.OFFLINE, 'B was never online');
  assert.equal(world.app.history.server.version, null);
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.fake.connectionStatus.connected, false);
});
