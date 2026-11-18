import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
import { createInstance } from '@amplitude/analytics-browser';
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  Event,
  getAnalyticsConnector,
  Payload,
} from '@amplitude/analytics-core';

const { render } = jest.requireActual<{ render: (source: string, data: Record<string, string>) => string }>('ejs');
// Evaluate the production template; replace only its bundled SDK globals.
const template = readFileSync(resolve(__dirname, '../amplitude-wrapper.js.ejs'), 'utf8').replace(/^import .*;\n/, '');
const source = render(template, {
  analyticsBrowserSnippet: '',
  pluginSessionReplaySnippet: 'var sessionReplay = window.sessionReplay;',
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let sequence = 0;
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function harness() {
  const instanceName = `gtm-lifecycle-${sequence++}`;
  const clients = { '': createInstance(), other: createInstance() };
  const forwarded: Event[] = [];
  const delivered: Event[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async (_url, options) => {
    const payload = JSON.parse(String(options?.body)) as Payload;
    delivered.push(...payload.events);
    return {
      status: 200,
      text: async () => JSON.stringify({ code: 200, events_ingested: payload.events.length }),
    } as Response;
  });
  const identityChanged = jest.fn<void, [unknown]>();
  const beforeSetup = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const setupStarted = deferred();
  const afterSetup = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const finishTeardown = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  // Assume the G&S teardown contract here; release validation must exercise the shipped runtime.
  const plugin = jest.fn((): EnrichmentPlugin<BrowserClient, BrowserConfig> => {
    let detach: (() => void) | undefined;
    const instance: EnrichmentPlugin<BrowserClient, BrowserConfig> = {
      name: '@amplitude/engagement-browser',
      type: 'enrichment',
      async setup(config) {
        expect(this).toBe(instance);
        setupStarted.resolve();
        await beforeSetup();
        const store = getAnalyticsConnector(config.instanceName).identityStore;
        const listener = () => identityChanged(store.getIdentity());
        store.addIdentityListener(listener);
        detach = () => store.removeIdentityListener(listener);
        await afterSetup();
      },
      async teardown() {
        expect(this).toBe(instance);
        detach?.();
        detach = undefined;
        await finishTeardown();
      },
      async execute(event) {
        expect(this).toBe(instance);
        forwarded.push(event);
        return event;
      },
    };
    return instance;
  });
  const beforeInit = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const initStarted = deferred();
  for (const client of Object.values(clients)) {
    const init = client.init.bind(client);
    jest.spyOn(client, 'init').mockImplementation((...args) => ({
      promise: (async () => {
        initStarted.resolve();
        await beforeInit();
        await init(...args).promise;
      })(),
    }));
    cleanups.push(async () => {
      await client.remove('@amplitude/engagement-browser').promise;
      await client.remove('network-connectivity-checker').promise;
    });
  }
  cleanups.push(async () => {
    globalThis.fetch = originalFetch;
  });
  const browserWindow = {
    amplitudeGTM: Object.assign(clients[''], { _iq: { other: clients.other } }),
    engagement: { plugin },
    sessionReplay: { plugin: () => ({ name: 'session-replay', type: 'enrichment' }) },
    _amplitude: undefined as unknown as (name: string, command: string, ...args: unknown[]) => Promise<void>,
  };
  runInNewContext(source, { window: browserWindow, version: 'test-version', console, setTimeout, clearTimeout });
  const options = (name: keyof typeof clients = '') => ({
    instanceName: `${instanceName}${name}`,
    userId: 'initial-user',
    deviceId: 'initial-device',
    identityStorage: 'none' as const,
    autocapture: false,
    defaultTracking: false,
    fetchRemoteConfig: false,
    enableDiagnostics: false,
    logLevel: 0,
    flushQueueSize: 1,
    flushIntervalMillis: 0,
    offline: undefined,
  });
  const initialize = (enabled = true, name: keyof typeof clients = '') =>
    browserWindow._amplitude(name, 'init', 'test-key', { ...options(name), guidesSurveys: enabled });
  const initializeDirect = () => clients[''].init('test-key', options()).promise;
  const track = (event = 'test-event', name: keyof typeof clients = '') => clients[name].track(event).promise;
  return {
    clients,
    initialize,
    initializeDirect,
    browserWindow,
    plugin,
    afterSetup,
    finishTeardown,
    track,
    forwarded,
    delivered,
    beforeSetup,
    setupStarted,
    beforeInit,
    initStarted,
    identityChanged,
  };
}

test('first Init and repeated Init deliver once to G&S and Analytics', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    await h.initialize();
    h.identityChanged.mockClear();
    h.clients[''].setUserId(`user-${i}`);
    expect(h.identityChanged).toHaveBeenCalledTimes(1);
    expect(h.identityChanged).toHaveBeenCalledWith(expect.objectContaining({ userId: `user-${i}` }));
    await h.track(`event-${i}`);
  }
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['event-0', 'event-1', 'event-2', 'event-3']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['event-0', 'event-1', 'event-2', 'event-3']);
  expect(h.delivered.every((event) => event.library === 'amplitude-ts-gtm-snippet/test-version')).toBe(true);
  expect(h.forwarded.map((event) => event.user_id)).toEqual(['user-0', 'user-1', 'user-2', 'user-3']);
});

test('disabling G&S detaches forwarding and identity; re-enabling restores both once', async () => {
  const h = harness();
  await h.initialize();
  await h.initialize(false);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('detached-user');
  expect(h.identityChanged).not.toHaveBeenCalled();
  await h.track('disabled');
  expect(h.forwarded).toHaveLength(0);
  await h.initialize();
  h.identityChanged.mockClear();
  h.clients[''].setUserId('reattached-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
  expect(h.identityChanged).toHaveBeenCalledWith(expect.objectContaining({ userId: 'reattached-user' }));
  await h.track('enabled');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['enabled']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['disabled', 'enabled']);
});

test.each([true, false])('overlapping Analytics initialization uses the first G&S setting: %s', async (enabled) => {
  const h = harness();
  const gate = deferred();
  h.beforeInit.mockReturnValueOnce(gate.promise);
  const owner = h.initialize(enabled);
  await h.initStarted.promise;
  const joined = h.initialize(!enabled);
  gate.resolve();
  await Promise.all([owner, joined]);
  expect(h.beforeInit).toHaveBeenCalledTimes(1);
  await h.track();
  expect(h.forwarded).toHaveLength(enabled ? 1 : 0);
  expect(h.delivered).toHaveLength(1);
});

test.each([false, true])('overlapping callers wait through G&S attachment (reinit: %s)', async (reinit) => {
  const h = harness();
  if (reinit) await h.initialize();
  const gate = deferred();
  const entered = deferred();
  h.beforeSetup.mockImplementationOnce(() => {
    entered.resolve();
    return gate.promise;
  });
  const owner = h.initialize();
  await entered.promise;
  const joined = h.initialize(false);
  const complete = jest.fn();
  void owner.then(complete);
  void joined.then(complete);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(complete).not.toHaveBeenCalled();
  h.identityChanged.mockClear();
  h.clients[''].setUserId('while-setup-pending');
  expect(h.identityChanged).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([owner, joined]);
  expect(complete).toHaveBeenCalledTimes(2);
  await h.track();
  expect(h.forwarded).toHaveLength(1);
});

test.each([false, true])(
  'G&S failure rejects all callers, preserves Analytics and permits retry (reinit: %s)',
  async (reinit) => {
    const h = harness();
    if (reinit) await h.initialize();
    const gate = deferred();
    const error = new Error('G&S boot failed');
    const entered = deferred();
    h.beforeSetup.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const owner = h.initialize();
    await entered.promise;
    const joined = h.initialize(false);
    const results = Promise.allSettled([owner, joined]);
    gate.reject(error);
    expect(await results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    h.identityChanged.mockClear();
    h.clients[''].setUserId('failed-user');
    expect(h.identityChanged).not.toHaveBeenCalled();
    await h.track('during-failure');
    await h.initialize();
    await h.track('after-retry');
    expect(h.forwarded.map((event) => event.event_type)).toEqual(['after-retry']);
    expect(h.delivered.map((event) => event.event_type)).toEqual(['during-failure', 'after-retry']);
    h.identityChanged.mockClear();
    h.clients[''].setUserId('retried-user');
    expect(h.identityChanged).toHaveBeenCalledTimes(1);
    expect(h.identityChanged).toHaveBeenCalledWith(expect.objectContaining({ userId: 'retried-user' }));
  },
);

test('Analytics failure releases the shared operation for another Init', async () => {
  const h = harness();
  h.beforeInit.mockRejectedValueOnce(new Error('Analytics initialization failed'));
  await expect(h.initialize()).rejects.toThrow('Analytics initialization failed');
  await h.initialize();
  await h.track();
  expect(h.forwarded).toHaveLength(1);
  expect(h.delivered).toHaveLength(1);
  expect(h.beforeSetup).toHaveBeenCalledTimes(1);
});

test('separate clients initialize independently and keep separate registrations', async () => {
  const h = harness();
  const gate = deferred();
  h.beforeSetup.mockReturnValueOnce(gate.promise);
  const first = h.initialize();
  await h.setupStarted.promise;
  await h.initialize(true, 'other');
  h.identityChanged.mockClear();
  h.clients.other.setUserId('other-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
  expect(h.identityChanged).toHaveBeenCalledWith(expect.objectContaining({ userId: 'other-user' }));
  await h.track('other-event', 'other');
  gate.resolve();
  await first;
  h.identityChanged.mockClear();
  h.clients[''].setUserId('default-user');
  h.clients.other.setUserId('updated-other-user');
  expect(h.identityChanged.mock.calls).toEqual([
    [expect.objectContaining({ userId: 'default-user' })],
    [expect.objectContaining({ userId: 'updated-other-user' })],
  ]);
  await h.initialize(false);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('detached-user');
  expect(h.identityChanged).not.toHaveBeenCalled();
  h.clients.other.setUserId('still-attached-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
  expect(h.identityChanged).toHaveBeenCalledWith(expect.objectContaining({ userId: 'still-attached-user' }));
  await h.track('still-attached', 'other');
  await h.track('detached');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['other-event', 'still-attached']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['other-event', 'still-attached', 'detached']);
});

test('startup events queued before Init and during setup reach G&S and Analytics once', async () => {
  const h = harness();
  const gate = deferred();
  h.beforeSetup.mockReturnValueOnce(gate.promise);
  const beforeInit = h.track('before-init');
  const initialized = h.initialize();
  await h.setupStarted.promise;
  const duringSetup = h.track('during-setup');
  // Give scheduled event processing a turn while G&S is deliberately unavailable.
  await new Promise((resolve) => setTimeout(resolve, 0));
  gate.resolve();
  await Promise.all([initialized, beforeInit, duringSetup]);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['before-init', 'during-setup']);
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['before-init', 'during-setup']);
});

test('failed startup setup releases queued events only to Analytics and allows retry', async () => {
  const h = harness();
  const gate = deferred();
  const error = new Error('startup setup failed');
  h.beforeSetup.mockReturnValueOnce(gate.promise);
  const startup = h.track('startup');
  const owner = h.initialize();
  await h.setupStarted.promise;
  const joined = h.initialize(false);
  const settled = Promise.allSettled([owner, joined]);
  const duringSetup = h.track('during-setup');
  gate.reject(error);
  expect(await settled).toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ]);
  await Promise.all([startup, duringSetup]);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['startup', 'during-setup']);
  expect(h.forwarded).toEqual([]);
  await h.initialize();
  await h.track('retry');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['retry']);
});

test.each([false, true])('completed external Init is supported (existing G&S: %s)', async (existing) => {
  const h = harness();
  await h.initializeDirect();
  if (existing) await h.clients[''].add(h.plugin()).promise;
  await h.initialize();
  h.identityChanged.mockClear();
  h.clients[''].setUserId('external-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
  await h.track('external');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['external']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['external']);
  // No real G&S setup is performed against the timeline about to be reset.
  expect(h.beforeSetup).toHaveBeenCalledTimes(existing ? 2 : 1);
});

test.each(['runtime', 'factory'])('G&S %s preparation failure still initializes Analytics', async (kind) => {
  const h = harness();
  const error = new Error('G&S unavailable');
  if (kind === 'factory') {
    h.plugin.mockImplementationOnce(() => {
      throw error;
    });
  } else {
    Object.defineProperty(h.browserWindow, 'engagement', {
      configurable: true,
      get() {
        throw error;
      },
    });
  }
  const startup = h.track('startup');
  await expect(h.initialize()).rejects.toBe(error);
  await startup;
  expect(h.delivered.map((event) => event.event_type)).toEqual(['startup']);
  expect(h.forwarded).toEqual([]);
  Object.defineProperty(h.browserWindow, 'engagement', { value: { plugin: h.plugin } });
  await h.initialize();
  await h.track('retry');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['retry']);
});

test('partial setup is cleaned before joined callers reject and the next Init retries', async () => {
  const h = harness();
  const error = new Error('failed after subscribing');
  const gate = deferred();
  const cleaning = deferred();
  h.afterSetup.mockRejectedValueOnce(error);
  h.finishTeardown.mockImplementationOnce(() => {
    cleaning.resolve();
    return gate.promise;
  });
  const owner = h.initialize();
  await cleaning.promise;
  const joined = h.initialize(false);
  const complete = jest.fn();
  const settled = Promise.allSettled([owner, joined]);
  void settled.then(complete);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('during-cleanup');
  expect(h.identityChanged).not.toHaveBeenCalled();
  await h.track('during-cleanup');
  expect(h.forwarded).toEqual([]);
  expect(complete).not.toHaveBeenCalled();
  gate.resolve();
  expect(await settled).toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ]);
  await h.initialize();
  h.clients[''].setUserId('retry-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
  await h.track('retry');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['retry']);
});

test('cleanup failure is reported without replacing the original setup rejection', async () => {
  const h = harness();
  const error = new Error('setup failed');
  const cleanupError = new Error('cleanup failed');
  const report = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  h.afterSetup.mockRejectedValueOnce(error);
  h.finishTeardown.mockRejectedValueOnce(cleanupError);
  await expect(h.initialize()).rejects.toBe(error);
  expect(report).toHaveBeenCalledWith('[Amplitude / GTM]', 'Failed to clean up G&S registration', cleanupError);
  await h.track('analytics-survives');
  expect(h.delivered.map((event) => event.event_type)).toEqual(['analytics-survives']);
  await h.initialize();
  await h.track('retry');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['retry']);
});

test('synchronous setup failure does not strand Analytics startup', async () => {
  const h = harness();
  const error = new Error('synchronous setup failure');
  const original = h.plugin.getMockImplementation();
  if (!original) throw new Error('Missing G&S plugin factory');
  h.plugin.mockImplementationOnce(() => ({
    ...original(),
    setup() {
      throw error;
    },
    teardown: jest.fn().mockResolvedValue(undefined),
  }));
  const startup = h.track('startup');
  await expect(h.initialize()).rejects.toBe(error);
  await startup;
  expect(h.delivered.map((event) => event.event_type)).toEqual(['startup']);
  await h.initialize();
  await h.track('retry');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['retry']);
});

test('first disabled Init does not prepare G&S and later enabling attaches once', async () => {
  const h = harness();
  await h.initialize(false);
  expect(h.plugin).not.toHaveBeenCalled();
  await h.track('disabled');
  await h.initialize();
  await h.track('enabled');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['enabled']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['disabled', 'enabled']);
});

test('registration does not mutate the G&S plugin object', async () => {
  const h = harness();
  const original = h.plugin.getMockImplementation();
  if (!original) throw new Error('Missing G&S plugin factory');
  h.plugin.mockImplementationOnce(() => Object.freeze(original()));
  await h.initialize();
  await h.track('frozen-plugin');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['frozen-plugin']);
  await h.initialize(false);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('detached');
  expect(h.identityChanged).not.toHaveBeenCalled();
});
