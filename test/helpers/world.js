// -----------------------------------------------------------------------------
// The integration wired to the fake Gladys of the SDK and to the fake Bark.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import {
  KEY_A,
  SERVER_URL,
  createFakeBark,
  createManualTimers,
  createMemoryStore,
} from './fakeBark.js';

export const BASE_CONFIG = { server_url: SERVER_URL, device_keys: KEY_A, language: 'en' };

export async function createWorld({
  config = BASE_CONFIG,
  stored = {},
  bark = createFakeBark(),
  connect = true,
  now,
} = {}) {
  const gladys = createFakeGladys({ config });
  const store = createMemoryStore(stored);
  const timers = createManualTimers();
  const clock = { time: new Date('2026-10-13T10:00:00Z') };
  const app = registerHandlers(gladys, {
    request: bark.request,
    store,
    now: now ?? (() => new Date(clock.time)),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, bark, store, timers, clock, app };
}
