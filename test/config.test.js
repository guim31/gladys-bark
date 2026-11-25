import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  DEFAULT_SERVER,
  normalizeConfig,
  normalizeContact,
  parseDeviceKeys,
  parseLevel,
} from '../src/config.js';

test('defaults: the official server, the Gladys group, French texts', () => {
  assert.deepEqual(normalizeConfig(undefined), {
    ...DEFAULT_CONFIG,
    device_keys: [],
    server_url: DEFAULT_SERVER,
  });
  assert.equal(normalizeConfig({ server_url: '  ' }).server_url, DEFAULT_SERVER);
  assert.equal(normalizeConfig({ group: '' }).group, '', 'an emptied group: no group');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('device keys: separated by commas or spaces, taken from a pasted address', () => {
  assert.deepEqual(
    parseDeviceKeys(
      'EXAMPLEkeyAAAAAAAAAAAA, https://api.day.app/EXAMPLEkeyBBBBBBBBBBBB/Title/Body;\nmykey  EXAMPLEkeyAAAAAAAAAAAA',
    ),
    ['EXAMPLEkeyAAAAAAAAAAAA', 'EXAMPLEkeyBBBBBBBBBBBB', 'mykey'],
  );
  assert.deepEqual(parseDeviceKeys('http://192.0.2.10/bark/EXAMPLEkeyCCCCCCCCCCCC/'), [
    'EXAMPLEkeyCCCCCCCCCCCC',
  ]);
  assert.deepEqual(parseDeviceKeys('https://bark.example.com/short'), ['short']);
  assert.deepEqual(parseDeviceKeys(undefined), []);
});

test('levels: any case, unknown values dropped', () => {
  assert.equal(parseLevel('timesensitive'), 'timeSensitive');
  assert.equal(parseLevel(' critical '), 'critical');
  assert.equal(parseLevel('default'), null);
  assert.equal(parseLevel(5), null);
});

test('"My account": the key(s) and level of one user', () => {
  assert.deepEqual(normalizeContact({ device_key: ' abc ', level: 'passive' }), {
    deviceKeys: ['abc'],
    level: 'passive',
  });
  assert.deepEqual(normalizeContact(null), { deviceKeys: [], level: null });
});
