import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import {
  InvalidMessageError,
  MAX_BODY_BYTES,
  cipherName,
  encrypt,
  fromGladysMessage,
  fromSceneAction,
  randomIv,
  shortenBytes,
} from '../src/bark/message.js';
import { normalizeConfig } from '../src/config.js';

const config = normalizeConfig({});
const options = { level: null, group: 'Gladys', language: 'en', encryptionKey: '' };

test('a Gladys message: titled Gladys, in the group, empty fields left out', () => {
  assert.deepEqual(fromGladysMessage({ text: ' Hello ' }, options), {
    title: 'Gladys',
    body: 'Hello',
    group: 'Gladys',
  });
  assert.throws(() => fromGladysMessage({ text: '  ' }, options), InvalidMessageError);
  assert.match(fromGladysMessage({ text: '', file: 'x' }, options).body, /^Image not sent/);
});

test('a scene notification with every field', () => {
  assert.deepEqual(
    fromSceneAction(
      {
        title: 'T',
        message: 'M',
        level: 'timeSensitive',
        sound: 'Bell.caf',
        icon: 'https://example.com/i.png',
        url: 'shortcuts://run-shortcut?name=Lights',
        image: 'https://example.com/a.jpg',
        call: 'true',
        group: '',
      },
      { ...config, default_level: 'passive' },
    ),
    {
      title: 'T',
      body: 'M',
      level: 'timeSensitive',
      sound: 'bell',
      group: 'Gladys',
      icon: 'https://example.com/i.png',
      url: 'shortcuts://run-shortcut?name=Lights',
      image: 'https://example.com/a.jpg',
      call: '1',
    },
  );
  assert.equal(fromSceneAction({ message: 'M', level: 'default' }, config).level, 'active');
});

test('a scene notification with a wrong field is refused, with a reason', () => {
  const wrong = (fields) =>
    assert.throws(() => fromSceneAction(fields, config), InvalidMessageError);
  wrong({ message: '' });
  wrong({ message: 'M', level: 'loud' });
  wrong({ message: 'M', sound: 'trumpet' });
  wrong({ message: 'M', url: 'javascript:alert(1)' });
  wrong({ message: 'M', image: 'not a url' });
});

test('long texts are cut in bytes, an ellipsis included', () => {
  assert.equal(shortenBytes('abc', 3), 'abc');
  assert.equal(shortenBytes('ééé', 5), 'é…');
  const body = fromSceneAction({ message: '€'.repeat(5000) }, config).body;
  assert.ok(Buffer.byteLength(body) <= MAX_BODY_BYTES);
});

test('encryption: AES-CBC as the Bark app decrypts it', () => {
  assert.equal(cipherName(''), null);
  assert.equal(cipherName('0123456789abcdef'), 'aes-128-cbc');
  assert.equal(cipherName('0123456789abcdef01234567'), 'aes-192-cbc');
  assert.throws(() => cipherName('short'), { kind: 'bad_encryption_key' });
  assert.match(randomIv(), /^[A-Za-z0-9]{16}$/);
  assert.notEqual(randomIv(), randomIv());

  // The example of the Bark documentation: key 1234567890123456, IV 1111111111111111.
  const { ciphertext, iv } = encrypt(
    { body: 'test', sound: 'birdsong' },
    '1234567890123456',
    '1111111111111111',
  );
  assert.equal(iv, '1111111111111111');
  const decipher = createDecipheriv(
    'aes-128-cbc',
    Buffer.from('1234567890123456'),
    Buffer.from(iv),
  );
  const clear = Buffer.concat([decipher.update(ciphertext, 'base64'), decipher.final()]);
  assert.deepEqual(JSON.parse(clear.toString()), { body: 'test', sound: 'birdsong' });

  const push = fromSceneAction(
    { title: 'T', message: 'M', level: 'critical', sound: 'alarm', url: 'https://example.com' },
    { ...config, encryption_key: '1234567890123456' },
  );
  assert.deepEqual(Object.keys(push).sort(), ['ciphertext', 'group', 'iv', 'level', 'sound']);
});
