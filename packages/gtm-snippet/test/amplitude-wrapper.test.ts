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
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function harness() {
  const instanceName = `gtm-lifecycle-${sequence++}`;
  const clients = { '': createInstance(), other: createInstance() };
  const forwarded: Event[] = [];
  const delivered: Event[] = [];
  const identityChanged = jest.fn<void, [unknown]>();
  const beforeSetup = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const setupStarted = deferred();
  const listeners = new Set<unknown>();
  const plugin = jest.fn((): EnrichmentPlugin<BrowserClient, BrowserConfig> => {
    let detach: (() => void) | undefined;
    return {
      name: '@amplitude/engagement-browser',
      type: 'enrichment',
      async setup(config) {
        setupStarted.resolve();
        await beforeSetup();
        const store = getAnalyticsConnector(config.instanceName).identityStore;
        const listener = () => identityChanged(store.getIdentity());
        store.addIdentityListener(listener);
        listeners.add(listener);
        detach = () => {
          store.removeIdentityListener(listener);
          listeners.delete(listener);
        };
      },
      async teardown() {
        detach?.();
        detach = undefined;
      },
      async execute(event) {
        forwarded.push(event);
        return event;
      },
    };
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
        // Retain the real timeline, substituting an in-memory Analytics transport.
        await client.remove('amplitude').promise;
        await client.add({
          name: 'test-destination',
          type: 'destination',
          async execute(event) {
            delivered.push(event);
            return { event, code: 200, message: 'OK' };
          },
        }).promise;
      })(),
    }));
    cleanups.push(async () => {
      await client.remove('@amplitude/engagement-browser').promise;
      await client.remove('network-connectivity-checker').promise;
    });
  }
  const browserWindow = {
    amplitudeGTM: Object.assign(clients[''], { _iq: { other: clients.other } }),
    engagement: { plugin },
    sessionReplay: { plugin: () => ({ name: 'session-replay', type: 'enrichment' }) },
    _amplitude: undefined as unknown as (name: string, command: string, ...args: unknown[]) => Promise<void>,
  };
  runInNewContext(source, { window: browserWindow, version: 'test-version', console, setTimeout, clearTimeout });
  const initialize = (enabled = true, name: keyof typeof clients = '') =>
    browserWindow._amplitude(name, 'init', 'test-key', {
      instanceName: `${instanceName}${name}`,
      userId: 'initial-user',
      deviceId: 'initial-device',
      identityStorage: 'none',
      autocapture: false,
      defaultTracking: false,
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      logLevel: 0,
      guidesSurveys: enabled,
    });
  const track = (event = 'test-event', name: keyof typeof clients = '') => clients[name].track(event).promise;
  return {
    clients,
    initialize,
    track,
    forwarded,
    delivered,
    plugin,
    beforeSetup,
    setupStarted,
    beforeInit,
    initStarted,
    identityChanged,
    listeners,
  };
}

test('first Init and repeated Init deliver once to G&S and Analytics', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    await h.initialize();
    await h.track(`event-${i}`);
    expect(h.delivered.map((event) => event.event_type)).toContain(`event-${i}`);
    expect(h.forwarded.map((event) => event.event_type)).toContain(`event-${i}`);
    expect(h.listeners.size).toBe(1);
  }
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['event-0', 'event-1', 'event-2', 'event-3']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['event-0', 'event-1', 'event-2', 'event-3']);
  expect(h.delivered.every((event) => event.library === 'amplitude-ts-gtm-snippet/test-version')).toBe(true);
  expect(h.plugin).toHaveBeenCalledTimes(4);
  expect(new Set(h.plugin.mock.results.map((result) => result.value as EnrichmentPlugin)).size).toBe(4);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('next-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
  await h.track('new-identity');
  expect(h.forwarded[4].user_id).toBe('next-user');
});

test('disabling G&S detaches forwarding and identity; re-enabling restores both once', async () => {
  const h = harness();
  await h.initialize();
  await h.initialize(false);
  expect(h.listeners.size).toBe(0);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('detached-user');
  expect(h.identityChanged).not.toHaveBeenCalled();
  await h.track('disabled');
  expect(h.forwarded).toHaveLength(0);
  await h.initialize();
  expect(h.listeners.size).toBe(1);
  h.identityChanged.mockClear();
  h.clients[''].setUserId('reattached-user');
  expect(h.identityChanged).toHaveBeenCalledTimes(1);
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
  expect(joined).toBe(owner);
  gate.resolve();
  await joined;
  expect(h.beforeInit).toHaveBeenCalledTimes(1);
  await h.track();
  expect(h.forwarded).toHaveLength(enabled ? 1 : 0);
  expect(h.delivered).toHaveLength(1);
});

test('overlapping callers wait through G&S setup and cannot disable the owning Init', async () => {
  const h = harness();
  const gate = deferred();
  h.beforeSetup.mockReturnValueOnce(gate.promise);
  const owner = h.initialize();
  await h.setupStarted.promise;
  const joined = h.initialize(false);
  expect(joined).toBe(owner);
  const complete = jest.fn();
  void joined.then(complete);
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  gate.resolve();
  await joined;
  expect(h.listeners.size).toBe(1);
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
    expect(h.listeners.size).toBe(0);
    await h.track('during-failure');
    await h.initialize();
    await h.track('after-retry');
    expect(h.forwarded.map((event) => event.event_type)).toEqual(['after-retry']);
    expect(h.delivered.map((event) => event.event_type)).toEqual(['during-failure', 'after-retry']);
    expect(h.listeners.size).toBe(1);
  },
);

test('Analytics failure releases the shared operation for another Init', async () => {
  const h = harness();
  h.beforeInit.mockRejectedValueOnce(new Error('Analytics initialization failed'));
  await expect(h.initialize()).rejects.toThrow('Analytics initialization failed');
  expect(h.plugin).not.toHaveBeenCalled();
  await h.initialize();
  await h.track();
  expect(h.forwarded).toHaveLength(1);
  expect(h.delivered).toHaveLength(1);
});

test('separate clients initialize independently and keep separate registrations', async () => {
  const h = harness();
  const gate = deferred();
  h.beforeSetup.mockReturnValueOnce(gate.promise);
  const first = h.initialize();
  await h.setupStarted.promise;
  await h.initialize(true, 'other');
  expect(h.listeners.size).toBe(1);
  await h.track('other-event', 'other');
  gate.resolve();
  await first;
  expect(h.listeners.size).toBe(2);
  await h.initialize(false);
  expect(h.listeners.size).toBe(1);
  await h.track('still-attached', 'other');
  await h.track('detached');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['other-event', 'still-attached']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['other-event', 'still-attached', 'detached']);
});
