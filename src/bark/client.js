// -----------------------------------------------------------------------------
// Bark server client (api.day.app or a self-hosted bark-server): the
// endpoints the integration needs.
//
//   GET  /ping  {"code":200,"message":"pong","timestamp":…}
//   GET  /info  {"version":"v2.4.0",…}  bark-server only; optional
//   POST /push  JSON { device_key, title?, subtitle?, body, level?, sound?, … }
//               → {"code":200,"message":"success"} or an error code
//
// Every failure becomes a BarkError with a `kind` (ERROR_KINDS) the rest of
// the code translates for the user. The device key only travels in the JSON
// body (never in a URL, never in a message): whoever has it can push to the
// phone. Real answers of bark-server v2.4.0 are in test/fixtures/bark/.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = {
  NO_SERVER: 'no_server',
  INVALID_URL: 'invalid_url',
  NO_KEY: 'no_key',
  BAD_ENCRYPTION_KEY: 'bad_encryption_key',
  UNREACHABLE: 'unreachable',
  TLS: 'tls',
  REDIRECT: 'redirect',
  NOT_BARK: 'not_bark',
  UNKNOWN_KEY: 'unknown_key',
  DEVICE_GONE: 'device_gone',
  REJECTED: 'rejected',
  SERVER_ERROR: 'server_error',
};

// The kinds that say "the server cannot be reached", as opposed to "it
// answered no": they drive the online/offline state of the monitor.
export const UNREACHABLE_KINDS = new Set([
  ERROR_KINDS.UNREACHABLE,
  ERROR_KINDS.TLS,
  ERROR_KINDS.REDIRECT,
  ERROR_KINDS.NOT_BARK,
]);

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'EPROTO',
]);

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// APNs answers meaning "this phone no longer takes this key": the app was
// deleted or reinstalled (bark-server then forgets the token and answers
// "device token invalid" to the next pushes).
const GONE_PATTERN = /BadDeviceToken|Unregistered|DeviceTokenNotForTopic|device token invalid/i;

export class BarkError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never a key)
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(kind, message, { status, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BarkError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The server address typed by the user, as a base URL: `https://` added when
 * no scheme is given, a path prefix kept (a bark-server behind a reverse
 * proxy), the trailing slash, query and fragment dropped.
 * @param {string} raw
 * @returns {URL}
 */
export function parseServerUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') {
    throw new BarkError(ERROR_KINDS.NO_SERVER, 'No Bark server address configured');
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new BarkError(ERROR_KINDS.INVALID_URL, 'The Bark server address is not a URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    throw new BarkError(ERROR_KINDS.INVALID_URL, 'The Bark server address must be http(s)');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url;
}

/** The address without credentials, for the logs. */
export function describeUrl(url) {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/** Shortens an error text coming from the server before it reaches a log or a toast. */
const shorten = (text, max = 200) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Removes a device key the server may echo in its error ("failed to get [KEY] …"). */
const scrub = (text, key) =>
  key && typeof text === 'string' ? text.split(key).join('[key]') : text;

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

export class BarkClient {
  /**
   * @param {object} options
   * @param {string} options.serverUrl the address typed by the user
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] replaced by the tests
   * @param {number} [options.timeoutMs]
   */
  constructor({ serverUrl, insecure = false, request = httpRequest, timeoutMs = 10_000 }) {
    this.base = parseServerUrl(serverUrl);
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  get description() {
    return describeUrl(this.base);
  }

  url(path) {
    const url = new URL(this.base.href);
    url.pathname = `${this.base.pathname.replace(/\/+$/, '')}${path}`;
    return url.href;
  }

  async call(method, path, { json, timeoutMs = this.timeoutMs, key } = {}) {
    let response;
    try {
      response = await this.request(this.url(path), {
        method,
        json,
        insecure: this.insecure,
        timeoutMs,
      });
    } catch (err) {
      const code = err?.code;
      if (TLS_CODES.has(code) || /certificate/i.test(err?.message ?? '')) {
        throw new BarkError(ERROR_KINDS.TLS, `TLS certificate refused (${code ?? 'TLS'})`, {
          cause: err,
        });
      }
      const reason = NETWORK_CODES.has(code) ? code : (code ?? err?.message ?? 'network error');
      throw new BarkError(ERROR_KINDS.UNREACHABLE, `Bark does not answer (${reason})`, {
        cause: err,
      });
    }
    const { status } = response;
    const data = parseJson(response.body);
    if (status >= 300 && status < 400) {
      throw new BarkError(ERROR_KINDS.REDIRECT, `The address redirects (HTTP ${status})`, {
        status,
      });
    }
    const isBark = data !== null && typeof data === 'object' && typeof data.code === 'number';
    if (status >= 200 && status < 300 && isBark && data.code === 200) {
      return data;
    }
    if (!isBark) {
      throw new BarkError(
        status >= 500 ? ERROR_KINDS.SERVER_ERROR : ERROR_KINDS.NOT_BARK,
        `Not a Bark answer (HTTP ${status})`,
        { status },
      );
    }
    const description = shorten(scrub(String(data.message ?? `HTTP ${status}`), key));
    if (GONE_PATTERN.test(description)) {
      throw new BarkError(ERROR_KINDS.DEVICE_GONE, `Apple refused the device: ${description}`, {
        status,
      });
    }
    if (/failed to get .*device token/i.test(description)) {
      throw new BarkError(ERROR_KINDS.UNKNOWN_KEY, 'Device key unknown to this server', {
        status,
      });
    }
    if (status >= 500 || data.code >= 500) {
      throw new BarkError(ERROR_KINDS.SERVER_ERROR, `Bark error: ${description}`, { status });
    }
    throw new BarkError(ERROR_KINDS.REJECTED, `Bark refused the request: ${description}`, {
      status,
    });
  }

  /**
   * Is the server up? GET /ping (also proves it is a Bark server), then the
   * version from GET /info when the server has it (bark-server does, a proxy
   * may not): never a failure.
   * @returns {Promise<{ version: string|null }>}
   */
  async check() {
    const pong = await this.call('GET', '/ping');
    if (pong.message !== 'pong') {
      throw new BarkError(ERROR_KINDS.NOT_BARK, 'No Bark server at this address');
    }
    let version = null;
    try {
      const response = await this.request(this.url('/info'), {
        method: 'GET',
        insecure: this.insecure,
        // Optional and after /ping: short, so a test stays within the 30 s of the action.
        timeoutMs: Math.min(this.timeoutMs, 3000),
      });
      const info = parseJson(response.body);
      if (response.status === 200 && typeof info?.version === 'string') {
        // Bounded: stored, shown in the widget and sent with a trigger.
        version = info.version.replace(/^v/i, '').slice(0, 40);
      }
    } catch {
      // /info is optional.
    }
    return { version };
  }

  /**
   * Pushes one notification to one device key.
   * @param {string} deviceKey
   * @param {Record<string, unknown>} payload the /push fields, without the key
   * @param {{ timeoutMs?: number }} [options]
   */
  async push(deviceKey, payload, { timeoutMs } = {}) {
    if (typeof deviceKey !== 'string' || deviceKey.trim() === '') {
      throw new BarkError(ERROR_KINDS.NO_KEY, 'No Bark device key');
    }
    const key = deviceKey.trim();
    return this.call('POST', '/push', {
      json: { ...payload, device_key: key },
      timeoutMs,
      key,
    });
  }
}

// The four reasons a delivery fails, as the "Notification not sent" trigger
// and the widget name them: the stable values of the trigger filter.
export const FAILURE_REASONS = ['unreachable', 'key', 'configuration', 'rejected'];

/**
 * The failure reason of an error kind (anything unknown is "rejected").
 * @param {string|undefined} kind
 * @returns {string} one of FAILURE_REASONS
 */
export function failureReason(kind) {
  if (UNREACHABLE_KINDS.has(kind)) {
    return 'unreachable';
  }
  if ([ERROR_KINDS.NO_KEY, ERROR_KINDS.UNKNOWN_KEY, ERROR_KINDS.DEVICE_GONE].includes(kind)) {
    return 'key';
  }
  if (
    [ERROR_KINDS.NO_SERVER, ERROR_KINDS.INVALID_URL, ERROR_KINDS.BAD_ENCRYPTION_KEY].includes(kind)
  ) {
    return 'configuration';
  }
  return 'rejected';
}
