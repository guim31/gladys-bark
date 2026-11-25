// -----------------------------------------------------------------------------
// Integration configuration (the `config_schema` of the manifest) and the
// per-user "My account" values (`contact_schema`), normalized so the rest of
// the code never deals with `undefined`, strings typed with spaces or a level
// Bark does not know.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_SERVER = 'https://api.day.app';

// The interruption levels of iOS, as Bark names them (`level` of /push).
export const LEVELS = ['active', 'timeSensitive', 'passive', 'critical'];
export const LEVEL_DEFAULT = 'default';

// The ringtones shipped with the Bark app (Bark/Sounds in its repository).
export const SOUNDS = [
  'alarm',
  'anticipate',
  'bell',
  'birdsong',
  'bloom',
  'calypso',
  'chime',
  'choo',
  'descent',
  'electronic',
  'fanfare',
  'glass',
  'gotosleep',
  'healthnotification',
  'horn',
  'ladder',
  'mailsent',
  'minuet',
  'multiwayinvitation',
  'newmail',
  'newsflash',
  'noir',
  'paymentsuccess',
  'shake',
  'sherwoodforest',
  'silence',
  'spell',
  'suspense',
  'telegraph',
  'tiptoes',
  'typewriters',
  'update',
];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js).
export const DEFAULT_CONFIG = {
  server_url: DEFAULT_SERVER,
  device_keys: '',
  default_level: 'active',
  group: 'Gladys',
  encryption_key: '',
  allow_self_signed: false,
  language: 'fr',
};

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * A level as Bark takes it, or null for "the default". Accepts any case
 * (a scene variable typed by hand): "timesensitive" is "timeSensitive".
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseLevel(value) {
  const text = trimmed(value).toLowerCase();
  return LEVELS.find((level) => level.toLowerCase() === text) ?? null;
}

/**
 * The device keys typed by the user: separated by commas, semicolons, spaces
 * or new lines. The app shows a whole push address (https://api.day.app/KEY/
 * or https://api.day.app/KEY/Title/Body): the key is taken from it.
 * Duplicates are dropped; the order is kept.
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseDeviceKeys(value) {
  const keys = trimmed(value)
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^https?:\/\//i.test(part)) {
        try {
          const segments = new URL(part).pathname.split('/').filter(Boolean);
          // Generated keys are 22 letters and digits: prefer such a segment
          // (a self-hosted server may sit under a path prefix), else the first.
          return (
            segments.find((segment) => /^[A-Za-z0-9]{16,}$/.test(segment)) ?? segments[0] ?? ''
          );
        } catch {
          return part;
        }
      }
      return part;
    })
    .filter(Boolean);
  return [...new Set(keys)];
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  const group = trimmed(config.group);
  return {
    server_url: trimmed(config.server_url) || DEFAULT_SERVER,
    device_keys: parseDeviceKeys(config.device_keys),
    default_level: parseLevel(config.default_level) ?? DEFAULT_CONFIG.default_level,
    group: typeof config.group === 'string' ? group : DEFAULT_CONFIG.group,
    encryption_key: typeof config.encryption_key === 'string' ? config.encryption_key.trim() : '',
    allow_self_signed: config.allow_self_signed === true,
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}

/**
 * The "My account" values of one user, as Gladys hands them to onSendMessage.
 * No key: the user receives nothing (the shared keys of the configuration are
 * other people's phones, never a fallback for a personal message).
 * @param {Record<string, unknown>} [contact]
 * @returns {{ deviceKeys: string[], level: string|null }}
 */
export function normalizeContact(contact = {}) {
  const values = contact ?? {};
  return {
    deviceKeys: parseDeviceKeys(values.device_key),
    level: parseLevel(values.level),
  };
}
