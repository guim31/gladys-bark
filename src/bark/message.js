// -----------------------------------------------------------------------------
// Gladys message / scene action → the fields of a Bark push (POST /push, the
// device key added by the client). Pure functions, no I/O except the random
// IV of the encryption.
//
// - Gladys messages carry no title: "Gladys" is used, in the configured group.
// - Bark only takes images by URL: the camera image of a Gladys message is
//   left out, and a line says so instead of losing the message.
// - Encryption (optional, as in the Bark app): AES-CBC, PKCS7, the key typed
//   in the app (16, 24 or 32 characters: AES-128/192/256) and a random IV of
//   16 characters sent along. The texts and links go in the ciphertext; the
//   level, the sound, the group and `call` stay readable, as the server and
//   iOS need them before the app decrypts.
// -----------------------------------------------------------------------------

import { createCipheriv, randomInt } from 'node:crypto';
import { LEVEL_DEFAULT, SOUNDS, parseLevel } from '../config.js';
import { IMAGE_DROPPED, pick } from '../texts.js';
import { BarkError, ERROR_KINDS } from './client.js';

// Title and subtitle are cut in UTF-8 bytes too: with the body, under 4 KB.
export const MAX_TITLE_BYTES = 250;
// Apple refuses a push over 4 KB: the body is cut in UTF-8 bytes, shorter when
// encrypted (base64 adds a third).
export const MAX_BODY_BYTES = 3000;
export const MAX_ENCRYPTED_BODY_BYTES = 2000;

/** A message the user typed wrong (a scene action field): shown as is. */
export class InvalidMessageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidMessageError';
  }
}

const asText = (value) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** Cuts a text to a number of UTF-8 bytes, an ellipsis included. */
export function shortenBytes(text, maxBytes) {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }
  const characters = Array.from(text);
  let bytes = 3; // the ellipsis
  let end = 0;
  while (
    end < characters.length &&
    bytes + Buffer.byteLength(characters[end], 'utf8') <= maxBytes
  ) {
    bytes += Buffer.byteLength(characters[end], 'utf8');
    end += 1;
  }
  return `${characters.slice(0, end).join('')}…`;
}

const bodyLimit = (encryptionKey) => (encryptionKey ? MAX_ENCRYPTED_BODY_BYTES : MAX_BODY_BYTES);

const IV_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A random IV of 16 letters and digits, as the Bark app takes it (a text, not hex). */
export function randomIv() {
  return Array.from({ length: 16 }, () => IV_ALPHABET[randomInt(IV_ALPHABET.length)]).join('');
}

/**
 * Checks the encryption key of the configuration.
 * @param {string} key
 * @returns {string|null} the cipher name, or null when encryption is off
 */
export function cipherName(key) {
  if (!key) {
    return null;
  }
  const bytes = Buffer.byteLength(key, 'utf8');
  if (![16, 24, 32].includes(bytes)) {
    throw new BarkError(
      ERROR_KINDS.BAD_ENCRYPTION_KEY,
      `The encryption key must be 16, 24 or 32 characters long (got ${bytes})`,
    );
  }
  return `aes-${bytes * 8}-cbc`;
}

/**
 * Encrypts the private fields of a push, as the Bark app decrypts them.
 * @param {Record<string, unknown>} fields
 * @param {string} key
 * @param {string} [iv] replaced by the tests
 * @returns {{ ciphertext: string, iv: string }}
 */
export function encrypt(fields, key, iv = randomIv()) {
  const cipher = createCipheriv(cipherName(key), Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(fields), 'utf8'),
    cipher.final(),
  ]).toString('base64');
  return { ciphertext, iv };
}

const PRIVATE_FIELDS = ['title', 'subtitle', 'body', 'url', 'icon', 'image'];

/** Drops empty fields, encrypts the private ones when a key is set. */
function finish(fields, encryptionKey) {
  const push = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== ''),
  );
  if (!encryptionKey) {
    return push;
  }
  const hidden = {};
  const visible = {};
  Object.entries(push).forEach(([name, value]) => {
    (PRIVATE_FIELDS.includes(name) ? hidden : visible)[name] = value;
  });
  return { ...visible, ...encrypt(hidden, encryptionKey) };
}

/**
 * The push for a message Gladys sends to a user (onSendMessage).
 * @param {{ text?: unknown, file?: unknown }} gladysMessage
 * @param {{ level: string|null, group: string, language: string, encryptionKey: string }} options
 */
export function fromGladysMessage(gladysMessage, { level, group, language, encryptionKey }) {
  const { text, file } = gladysMessage ?? {};
  let body = asText(text);
  if (file) {
    const note = pick(IMAGE_DROPPED, language);
    body = body === '' ? note : `${body}\n\n${note}`;
  }
  if (body === '') {
    throw new InvalidMessageError('Empty message: nothing to send to Bark');
  }
  return finish(
    {
      title: 'Gladys',
      body: shortenBytes(body, bodyLimit(encryptionKey)),
      level: level ?? undefined,
      group,
    },
    encryptionKey,
  );
}

/** An http(s) URL, or undefined when the field is empty. */
function parseLink(value, fieldName, { schemes = ['http:', 'https:'] } = {}) {
  const text = asText(value);
  if (text === '') {
    return undefined;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new InvalidMessageError(`${fieldName}: not a URL`);
  }
  if (!schemes.includes(url.protocol)) {
    throw new InvalidMessageError(`${fieldName}: only http:// and https:// addresses are allowed`);
  }
  return url.href;
}

/** A sound of the Bark app, or undefined for the default one. */
function parseSound(value) {
  const text = asText(value)
    .toLowerCase()
    .replace(/\.caf$/, '');
  if (text === '' || text === LEVEL_DEFAULT) {
    return undefined;
  }
  if (!SOUNDS.includes(text)) {
    throw new InvalidMessageError(`sound: "${text}" is not a sound of the Bark app`);
  }
  return text;
}

/**
 * The push of the "Send a Bark notification" scene action.
 * @param {Record<string, unknown>} fields the resolved scene action fields
 * @param {{ default_level: string|null, group: string, encryption_key: string }} config
 */
export function fromSceneAction(fields, config) {
  const body = asText(fields?.message);
  if (body === '') {
    throw new InvalidMessageError('message: the text of the notification is empty');
  }
  const rawLevel = asText(fields?.level);
  const level = parseLevel(rawLevel);
  if (rawLevel !== '' && rawLevel !== LEVEL_DEFAULT && level === null) {
    throw new InvalidMessageError(`level: "${rawLevel}" is not a Bark level`);
  }
  const group = asText(fields?.group) || config.group;
  return finish(
    {
      title: shortenBytes(asText(fields?.title), MAX_TITLE_BYTES),
      subtitle: shortenBytes(asText(fields?.subtitle), MAX_TITLE_BYTES),
      body: shortenBytes(body, bodyLimit(config.encryption_key)),
      level: level ?? config.default_level ?? undefined,
      sound: parseSound(fields?.sound),
      group,
      icon: parseLink(fields?.icon, 'icon'),
      // A tap may also open Shortcuts, the phone, mail, Maps or messages.
      url: parseLink(fields?.url, 'url', {
        schemes: ['http:', 'https:', 'shortcuts:', 'tel:', 'mailto:', 'maps:', 'sms:'],
      }),
      image: parseLink(fields?.image, 'image'),
      call: fields?.call === true || fields?.call === 'true' ? '1' : undefined,
    },
    config.encryption_key,
  );
}
