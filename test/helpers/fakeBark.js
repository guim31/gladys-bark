// -----------------------------------------------------------------------------
// An in-memory Bark server answering with the real answers captured in
// test/fixtures/bark/: a drop-in replacement of src/bark/http.js.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

// Invented keys, shaped like the 22-character keys bark-server generates.
export const KEY_A = 'EXAMPLEkeyAAAAAAAAAAAA';
export const KEY_B = 'EXAMPLEkeyBBBBBBBBBBBB';
export const USER_KEY = 'EXAMPLEkeyUSERUSERUSER';
export const GONE_KEY = 'EXAMPLEkeyGONEGONEGONE';
export const SERVER_URL = 'http://192.0.2.10:8080';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/bark/${name}.json`, import.meta.url), 'utf8'));

const answer = ({ status, body }) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const unknownKey = (key) => {
  const { status, body } = fixture('error-unknown-key');
  return { status, body: { ...body, message: body.message.replace('KEY', key) } };
};

export function createFakeBark({ keys = [KEY_A, KEY_B, USER_KEY], gone = [GONE_KEY] } = {}) {
  const fake = {
    /** Every request received: { method, path, json, insecure, timeoutMs }. */
    calls: [],
    /** The pushes accepted: the JSON bodies. */
    pushes: [],
    /** A network error code (ECONNREFUSED…) to throw, or null. */
    down: null,
    /** Replaces the answer of one "METHOD /path": a function of the call, or a fixed answer. */
    overrides: new Map(),

    async request(url, { method = 'GET', json, insecure, timeoutMs } = {}) {
      const target = new URL(url);
      const call = { method, url, path: target.pathname, json, insecure, timeoutMs };
      fake.calls.push(call);
      if (fake.down) {
        const error = new Error(`connect ${fake.down}`);
        error.code = fake.down;
        throw error;
      }
      const override = fake.overrides.get(`${method} ${target.pathname}`);
      if (override) {
        return answer(typeof override === 'function' ? override(call) : override);
      }
      const path = target.pathname.replace(/^\/bark/, '');
      if (method === 'GET' && path === '/ping') {
        return answer(fixture('ping'));
      }
      if (method === 'GET' && path === '/info') {
        return answer(fixture('info'));
      }
      if (method === 'POST' && path === '/push') {
        const key = json?.device_key;
        if (gone.includes(key)) {
          return answer(fixture('error-bad-device-token'));
        }
        if (!keys.includes(key)) {
          return answer(unknownKey(key));
        }
        fake.pushes.push(json);
        return answer(fixture('push-success'));
      }
      // bark-server reads any other path as /:device_key.
      return answer(unknownKey(path.slice(1)));
    },
  };
  fake.request = fake.request.bind(fake);
  return fake;
}

/** A store kept in memory (same interface as src/store.js). */
export function createMemoryStore(initial = {}) {
  return {
    data: structuredClone(initial),
    saves: 0,
    async load() {
      return structuredClone(this.data);
    },
    save(data) {
      this.data = structuredClone(data);
      this.saves += 1;
      return Promise.resolve();
    },
    flush() {
      return Promise.resolve();
    },
  };
}

/** Timers run by hand: `timers.pending` lists them, `timers.run()` fires the due ones. */
export function createManualTimers() {
  const timers = {
    pending: [],
    set(callback, delay) {
      const timer = { callback, delay };
      timers.pending.push(timer);
      return timer;
    },
    clear(timer) {
      timers.pending = timers.pending.filter((entry) => entry !== timer);
    },
    /** Fires every pending timer once; resolves once the callbacks settled. */
    async runAll() {
      const due = timers.pending;
      timers.pending = [];
      due.forEach((timer) => timer.callback());
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
  return timers;
}
