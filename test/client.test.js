// -----------------------------------------------------------------------------
// The Bark client against the real answers of bark-server (test/fixtures/bark).
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BarkClient,
  ERROR_KINDS,
  FAILURE_REASONS,
  failureReason,
  parseServerUrl,
} from '../src/bark/client.js';
import { GONE_KEY, KEY_A, SERVER_URL, createFakeBark, fixture } from './helpers/fakeBark.js';

const clientOf = (bark, serverUrl = SERVER_URL) =>
  new BarkClient({ serverUrl, request: bark.request });

const rejectsWith = (promise, kind) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.kind, kind);
    return true;
  });

test('server addresses: https by default, a path prefix kept, credentials dropped', () => {
  assert.equal(parseServerUrl('api.day.app').href, 'https://api.day.app/');
  assert.equal(parseServerUrl('http://192.0.2.10:8080/bark/').href, 'http://192.0.2.10:8080/bark');
  assert.equal(parseServerUrl('https://user:pw@example.com/?a=1#x').href, 'https://example.com/');
  assert.throws(() => parseServerUrl(''), { kind: ERROR_KINDS.NO_SERVER });
  assert.throws(() => parseServerUrl('ftp://example.com'), { kind: ERROR_KINDS.INVALID_URL });
  assert.throws(() => parseServerUrl('http://'), { kind: ERROR_KINDS.INVALID_URL });
});

test('check: ping, then the version from /info when the server has it', async () => {
  const bark = createFakeBark();
  assert.deepEqual(await clientOf(bark).check(), { version: '2.4.0' });
  assert.deepEqual(
    bark.calls.map((call) => call.path),
    ['/ping', '/info'],
  );
  bark.overrides.set('GET /info', { status: 404, body: 'Not Found' });
  assert.deepEqual(await clientOf(bark).check(), { version: null });
});

test('check under a path prefix', async () => {
  const bark = createFakeBark();
  await clientOf(bark, 'http://192.0.2.10/bark').check();
  assert.equal(bark.calls[0].url, 'http://192.0.2.10/bark/ping');
});

test('check fails on what is not a Bark server', async () => {
  const bark = createFakeBark();
  bark.overrides.set('GET /ping', { status: 200, body: '<html>router</html>' });
  await rejectsWith(clientOf(bark).check(), ERROR_KINDS.NOT_BARK);
  bark.overrides.set('GET /ping', { status: 302, body: '' });
  await rejectsWith(clientOf(bark).check(), ERROR_KINDS.REDIRECT);
  bark.overrides.set('GET /ping', { status: 502, body: 'Bad Gateway' });
  await rejectsWith(clientOf(bark).check(), ERROR_KINDS.SERVER_ERROR);
});

test('network and certificate errors', async () => {
  const bark = createFakeBark();
  bark.down = 'ECONNREFUSED';
  await rejectsWith(clientOf(bark).check(), ERROR_KINDS.UNREACHABLE);
  bark.down = 'DEPTH_ZERO_SELF_SIGNED_CERT';
  await rejectsWith(clientOf(bark).check(), ERROR_KINDS.TLS);
});

test('push: the key goes in the JSON body, never in the URL', async () => {
  const bark = createFakeBark();
  const answer = await clientOf(bark).push(` ${KEY_A} `, { body: 'Hi' }, { timeoutMs: 1234 });
  assert.deepEqual(answer, fixture('push-success').body);
  assert.equal(bark.calls[0].url, `${SERVER_URL}/push`);
  assert.deepEqual(bark.calls[0].json, { body: 'Hi', device_key: KEY_A });
  assert.equal(bark.calls[0].timeoutMs, 1234);
});

test('push errors, as bark-server answers them, never echo the key', async () => {
  const bark = createFakeBark();
  const wrong = 'EXAMPLEkeyWRONGWRONGWR';
  await assert.rejects(clientOf(bark).push(wrong, { body: 'x' }), (err) => {
    assert.equal(err.kind, ERROR_KINDS.UNKNOWN_KEY);
    assert.equal(err.status, 400);
    assert.ok(!err.message.includes(wrong));
    return true;
  });
  await rejectsWith(clientOf(bark).push(GONE_KEY, { body: 'x' }), ERROR_KINDS.DEVICE_GONE);
  bark.overrides.set('POST /push', fixture('error-device-token-invalid'));
  await rejectsWith(clientOf(bark).push(KEY_A, { body: 'x' }), ERROR_KINDS.DEVICE_GONE);
  bark.overrides.set('POST /push', { status: 500, body: { code: 500, message: 'push failed: x' } });
  await rejectsWith(clientOf(bark).push(KEY_A, { body: 'x' }), ERROR_KINDS.SERVER_ERROR);
  bark.overrides.set('POST /push', { status: 400, body: { code: 400, message: 'bad request' } });
  await rejectsWith(clientOf(bark).push(KEY_A, { body: 'x' }), ERROR_KINDS.REJECTED);
  await rejectsWith(clientOf(bark).push('  ', { body: 'x' }), ERROR_KINDS.NO_KEY);
});

test('every error kind has a failure reason', () => {
  for (const kind of Object.values(ERROR_KINDS)) {
    assert.ok(FAILURE_REASONS.includes(failureReason(kind)), kind);
  }
  assert.equal(failureReason(ERROR_KINDS.DEVICE_GONE), 'key');
  assert.equal(failureReason(ERROR_KINDS.BAD_ENCRYPTION_KEY), 'configuration');
  assert.equal(failureReason(undefined), 'rejected');
});
