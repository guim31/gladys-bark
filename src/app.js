// -----------------------------------------------------------------------------
// The integration: wires the Gladys SDK to the Bark client.
//
// - onSendMessage: Gladys sends a message to ONE user (a scene "Send a
//   message", the replies of the brain, the system messages). The user's
//   "My account" values (contact_schema) give the device key(s) of their
//   iPhone and the level; no key, no message (never the shared keys).
// - Scene action `send_notification`: a notification with title, level,
//   sound, group, icon, link and image, to the device keys of the
//   configuration.
// - Action `test_connection` and the widget button: check the server, send a
//   test notification to the device keys of the configuration.
// - A health check every 5 minutes (GET /ping, no key): the
//   connection status of the Configuration screen, the widget, and the
//   `server_offline` / `server_online` triggers. Offline is declared after two
//   failed checks 30 s apart, never on one blip.
// - Trigger `delivery_failed`: at most once per reason per 15 minutes, so a
//   scene answering it with another Bark notification cannot loop.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, normalizeContact } from './config.js';
import {
  BarkClient,
  BarkError,
  ERROR_KINDS,
  UNREACHABLE_KINDS,
  failureReason,
} from './bark/client.js';
import {
  InvalidMessageError,
  cipherName,
  fromGladysMessage,
  fromSceneAction,
} from './bark/message.js';
import { httpRequest } from './bark/http.js';
import { History, SERVER_STATES } from './history.js';
import { createFailureLog } from './log.js';
import { Store } from './store.js';
import { REPORT_TEXT, each, errorText, errorTexts } from './texts.js';
import { TEST_ACTION, WIDGET_KEY, buildWidgetContent } from './widgets.js';

const logger = createLogger({ name: 'bark' });

/**
 * A failed user action: Gladys shows in red what a handler throws, in green
 * what it returns. The message is the multi-language object of the report.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export const ACTION_KEY = 'test_connection';
export const SCENE_ACTION_KEY = 'send_notification';
export const TRIGGERS = {
  OFFLINE: 'server_offline',
  ONLINE: 'server_online',
  FAILED: 'delivery_failed',
};

export const CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const RECHECK_DELAY_MS = 30 * 1000;
export const FAILURE_EVENT_INTERVAL_MS = 15 * 60 * 1000;
// Gladys waits 5 s for the ack of a message: answer before, even if Bark is slow.
export const MESSAGE_TIMEOUT_MS = 4000;
// The test runs /ping (10 s at most), /info (3 s) then the pushes: under the 30 s of the action.
export const ACTION_TIMEOUT_MS = 8000;

/** A stable fingerprint of the server address, stored instead of the address itself. */
const fingerprint = (client) =>
  client ? createHash('sha256').update(client.base.href).digest('hex').slice(0, 16) : null;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options] replaced by the tests
 * @param {typeof httpRequest} [options.request]
 * @param {{ load(): Promise<object>, save(data: object): Promise<void>, flush(): Promise<void> }} [options.store]
 * @param {() => Date} [options.now]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 */
export function registerHandlers(gladys, options = {}) {
  const {
    request = httpRequest,
    store = new Store(),
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = options;

  const history = new History({ store, now });
  const loaded = history.load();

  let config = normalizeConfig({});
  let client = null;
  let configError = new BarkError(ERROR_KINDS.NO_SERVER, 'Not configured yet');
  let generation = 0; // bumped at each configuration: stale checks are ignored
  let failures = 0; // consecutive failed checks
  let timer = null;
  let checking = null;
  let stopped = false;
  let lastStatus = null; // the last connection status published, to publish changes only
  const lastFailureEvent = new Map(); // reason → time of the last delivery_failed event
  // Logs, at info level the lifecycle only: what this process last said of the
  // server (null: nothing yet, or a new address), and repeated failures once.
  let loggedState = null;
  const statusLog = createFailureLog(logger, { recovered: 'Connection status published again' });
  const checkLog = createFailureLog(logger, { level: 'error' });

  // --- Gladys side effects, never fatal --------------------------------------

  async function publishStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === lastStatus || !gladys.connected) {
      return;
    }
    try {
      await gladys.setConnectionStatus(connected, message);
      lastStatus = key;
      statusLog.ok();
    } catch (err) {
      // Retried at each check until it passes: one line, not one per check.
      statusLog.fail(`Cannot publish the connection status: ${err.message}`);
    }
  }

  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Cannot fire the "${key}" trigger: ${err.message}`);
    }
  }

  function refreshWidget() {
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not requested: ${err.message}`);
    }
  }

  // --- Server state ------------------------------------------------------------

  function schedule(delay) {
    if (timer) {
      clearTimer(timer);
    }
    timer = stopped
      ? null
      : setTimer(() => {
          timer = null;
          check()
            .then(() => checkLog.ok())
            .catch((err) => checkLog.fail('Health check failed', err));
        }, delay);
    timer?.unref?.();
  }

  async function setServerState(state, { version, error, address, current }) {
    await loaded;
    if (current !== generation) {
      return; // the configuration changed meanwhile: this result is about another server
    }
    const previous = history.setServer({ state, address, version });
    if (previous === state) {
      return;
    }
    refreshWidget();
    // Transitions only: the first state known after an installation or a new
    // address is not news.
    if (previous === SERVER_STATES.ONLINE && state === SERVER_STATES.OFFLINE) {
      await fire(TRIGGERS.OFFLINE, { error: errorText(error, config.language) });
    } else if (previous === SERVER_STATES.OFFLINE && state === SERVER_STATES.ONLINE) {
      await fire(TRIGGERS.ONLINE, { version: version ?? '' });
    }
  }

  /**
   * One line when this process first knows the state of the server, then one
   * per change, whatever was persisted: a restart says where it stands, and a
   * server down for days writes nothing at each check.
   */
  function logServerState(state, { version, error }) {
    if (state === loggedState) {
      return;
    }
    const first = loggedState === null;
    loggedState = state;
    if (state === SERVER_STATES.ONLINE) {
      logger.info(
        first
          ? `Connected to the Bark server${version ? ` (version ${version})` : ''}`
          : `The Bark server is back online`,
      );
    } else {
      logger.warn(
        first
          ? `The Bark server does not answer: ${error?.message}`
          : `The Bark server is offline: ${error?.message}`,
      );
    }
  }

  async function runCheck() {
    const current = generation;
    if (!client) {
      failures = 0;
      await publishStatus(false, errorTexts(configError));
      refreshWidget();
      return;
    }
    // The client and its address are captured: applyConfig may replace them
    // during any await below, and the generation check then drops the result.
    const checked = client;
    const address = fingerprint(checked);
    try {
      const { version } = await checked.check();
      if (current !== generation) {
        return;
      }
      failures = 0;
      await setServerState(SERVER_STATES.ONLINE, { version, address, current });
      if (current === generation) {
        logServerState(SERVER_STATES.ONLINE, { version });
        await publishStatus(true);
      }
    } catch (err) {
      if (current !== generation) {
        return;
      }
      failures += 1;
      logger.debug(`Health check of ${checked.description} failed: ${err.message}`);
      if (failures >= 2 || history.server.state !== SERVER_STATES.ONLINE) {
        await setServerState(SERVER_STATES.OFFLINE, { error: err, address, current });
        if (current === generation) {
          logServerState(SERVER_STATES.OFFLINE, { error: err });
          await publishStatus(false, errorTexts(err));
        }
      }
    } finally {
      if (current === generation) {
        schedule(failures === 1 ? RECHECK_DELAY_MS : CHECK_INTERVAL_MS);
      }
    }
  }

  /** One check at a time; a check requested meanwhile runs right after. */
  function check() {
    if (stopped) {
      return Promise.resolve();
    }
    if (!checking) {
      checking = runCheck().finally(() => {
        checking = null;
      });
    }
    return checking;
  }

  async function applyConfig(raw) {
    config = normalizeConfig(raw);
    generation += 1;
    failures = 0;
    loggedState = null; // a saved configuration says again where the server stands
    try {
      client = new BarkClient({
        serverUrl: config.server_url,
        insecure: config.allow_self_signed,
        request,
      });
      cipherName(config.encryption_key); // a wrong key length is a configuration error
      configError = null;
    } catch (err) {
      client = null;
      configError = err;
    }
    await loaded;
    if (history.server.address !== fingerprint(client)) {
      // Another server: what was known of the previous one no longer holds.
      history.setServer({
        state: SERVER_STATES.UNKNOWN,
        address: fingerprint(client),
        version: null,
      });
    }
    await checking; // let a check of the previous configuration end (its result is ignored)
    await check();
  }

  // --- Deliveries ----------------------------------------------------------------

  async function afterDelivery({ origin, delivered, error, notification }) {
    await loaded;
    history.record({ origin, delivered, kind: error?.kind, notification });
    refreshWidget();
    if (delivered) {
      if (history.server.state !== SERVER_STATES.ONLINE) {
        check().catch(() => {});
      }
      return;
    }
    if (UNREACHABLE_KINDS.has(error?.kind) && history.server.state === SERVER_STATES.ONLINE) {
      check().catch(() => {});
    }
    if (origin === 'test') {
      return; // the user is looking at the result already
    }
    const reason = failureReason(error instanceof InvalidMessageError ? undefined : error?.kind);
    const last = lastFailureEvent.get(reason);
    if (last !== undefined && now().getTime() - last < FAILURE_EVENT_INTERVAL_MS) {
      return;
    }
    lastFailureEvent.set(reason, now().getTime());
    const event = fire(TRIGGERS.FAILED, {
      reason,
      origin,
      error: errorText(error, config.language),
    });
    // A Gladys message is acked within 5 s: its trigger is not waited for
    // (fire never rejects).
    if (origin !== 'gladys_message') {
      await event;
    }
  }

  function requireClient() {
    if (!client) {
      throw configError;
    }
    return client;
  }

  /**
   * Pushes the same notification to every key, in parallel.
   * @returns {Promise<{ sent: number, total: number, error: Error|null }>} the first error, if any
   */
  async function pushAll(target, keys, payload, timeoutMs) {
    if (keys.length === 0) {
      throw new BarkError(ERROR_KINDS.NO_KEY, 'No Bark device key');
    }
    const results = await Promise.allSettled(
      keys.map((key) => target.push(key, payload, { timeoutMs })),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    failures.forEach((failure, index) =>
      logger.debug(`Push to device ${index + 1} failed: ${failure.reason?.message}`),
    );
    return {
      sent: results.length - failures.length,
      total: results.length,
      error: failures[0]?.reason ?? null,
    };
  }

  /** Sends the test notification to the keys of the configuration: the action and the widget button. */
  async function testConnection() {
    // Captured once: a configuration saved during the test must not mix servers and keys.
    const tested = client;
    const settings = config;
    const failure = configError;
    let version;
    try {
      if (!tested) {
        throw failure;
      }
      ({ version } = await tested.check());
    } catch (err) {
      check().catch(() => {});
      throw new ActionFailure(
        each(REPORT_TEXT, (text, lang) =>
          tested ? text.unreachable(errorText(err, lang)) : text.failed(errorText(err, lang)),
        ),
      );
    }
    check().catch(() => {});
    const reachable = (text) => text.reachable(version);
    const text = REPORT_TEXT[settings.language];
    let result;
    try {
      const payload = fromSceneAction({ title: text.title, message: text.message }, settings);
      result = await pushAll(tested, settings.device_keys, payload, ACTION_TIMEOUT_MS);
    } catch (err) {
      result = { sent: 0, total: settings.device_keys.length, error: err };
    }
    const { sent, total, error } = result;
    await afterDelivery({ origin: 'test', delivered: error === null, error });
    if (error === null) {
      return each(REPORT_TEXT, (t) => `${reachable(t)} ${t.sent(sent)}`);
    }
    throw new ActionFailure(
      each(REPORT_TEXT, (t, lang) =>
        sent > 0
          ? `${reachable(t)} ${t.partly(sent, total, errorText(error, lang))}`
          : `${reachable(t)} ${t.failed(errorText(error, lang))}`,
      ),
    );
  }

  // --- Handlers ----------------------------------------------------------------

  gladys.onSendMessage(async (contact, message) => {
    const { deviceKeys, level } = normalizeContact(contact);
    if (deviceKeys.length === 0) {
      // "My account" saved without a key: the user asked for nothing.
      return;
    }
    try {
      const payload = fromGladysMessage(message, {
        level: level ?? config.default_level,
        group: config.group,
        language: config.language,
        encryptionKey: config.encryption_key,
      });
      const { error } = await pushAll(requireClient(), deviceKeys, payload, MESSAGE_TIMEOUT_MS);
      if (error) {
        throw error;
      }
      await afterDelivery({ origin: 'gladys_message', delivered: true });
    } catch (err) {
      logger.warn(`Message not delivered to Bark: ${err.message}`);
      await afterDelivery({ origin: 'gladys_message', delivered: false, error: err });
      // The core logs this text: the English explanation, never the key.
      throw new Error(`Bark: ${errorText(err, 'en')}`, { cause: err });
    }
  });

  gladys.onSceneAction(SCENE_ACTION_KEY, async (fields) => {
    // Invalid fields fail the action (the scene logs it); a delivery failure
    // is an output the scene can test, like the `delivery_failed` trigger.
    const payload = fromSceneAction(fields, config);
    const notification = {
      title: typeof fields?.title === 'string' ? fields.title.trim() : '',
      message: String(fields?.message ?? '').trim(),
      level: payload.level ?? null,
    };
    try {
      const { sent, error } = await pushAll(
        requireClient(),
        config.device_keys,
        payload,
        ACTION_TIMEOUT_MS,
      );
      if (error) {
        logger.warn(`Scene notification not delivered to every device: ${error.message}`);
      }
      await afterDelivery({
        origin: 'scene_action',
        delivered: error === null,
        error,
        notification,
      });
      return {
        delivered: error === null,
        sent_count: sent,
        error: error ? errorText(error, config.language) : '',
      };
    } catch (err) {
      logger.warn(`Scene notification not delivered to Bark: ${err.message}`);
      await afterDelivery({ origin: 'scene_action', delivered: false, error: err, notification });
      return { delivered: false, sent_count: 0, error: errorText(err, config.language) };
    }
  });

  gladys.onAction(ACTION_KEY, () => testConnection());

  gladys.onWidgetGet(WIDGET_KEY, async ({ language, settings }) => {
    await loaded;
    return buildWidgetContent(
      {
        server: history.server,
        configured: client !== null,
        today: history.today(),
        recent: history.data.recent,
      },
      language,
      settings,
    );
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey) => {
    if (actionKey !== TEST_ACTION) {
      throw new Error(`Unknown widget action "${actionKey}"`);
    }
    // A toast holds 200 characters.
    const fit = (report) =>
      each(report, (text) => (text.length > 200 ? `${text.slice(0, 199)}…` : text));
    try {
      return fit(await testConnection());
    } catch (err) {
      if (err instanceof ActionFailure) {
        throw new ActionFailure(fit(err.message));
      }
      throw err;
    }
  });

  gladys.onConfigUpdated((raw) => applyConfig(raw));

  gladys.on('connected', () => {
    lastStatus = null; // a new connection: publish the status again
    return applyConfig(gladys.config).catch((err) =>
      logger.error('Cannot apply the configuration', err),
    );
  });

  return {
    check,
    history,
    get config() {
      return config;
    },
    async stop() {
      stopped = true;
      generation += 1;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      await checking;
      await history.flush();
    },
  };
}
