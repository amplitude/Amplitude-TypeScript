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
const template = readFileSync(resolve(__dirname, '../amplitude-wrapper.js.ejs'), 'utf8').replace(/^import .*;\n/, '');
const source = render(template, {
  analyticsBrowserSnippet: '',
  pluginSessionReplaySnippet: 'var sessionReplay = window.sessionReplay;',
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let nextInstance = 0;
function harness() {
  const instanceName = `gtm-${nextInstance++}`;
  const client = createInstance();
  const other = createInstance();
  const clients = { '': client, other };
  const forwarded: Event[] = [];
  const delivered: Event[] = [];
  for (const analytics of [client, other]) {
    const originalInit = analytics.init.bind(analytics);
    jest.spyOn(analytics, 'init').mockImplementation((...args) => ({
      promise: originalInit(...args).promise.then(async () => {
        // Use an in-memory destination behind the real SDK timeline. Network
        // delivery is exercised separately by the browser integration tests.
        await analytics.remove('amplitude').promise;
        await analytics.add({
          name: 'test-destination',
          type: 'destination',
          execute: async (event) => {
            delivered.push(event);
            return { event, code: 200, message: 'OK' };
          },
        }).promise;
      }),
    }));
  }
  const userChanges = jest.fn();
  const beforeSetup = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const setup = jest.fn(async function (this: EnrichmentPlugin, config: BrowserConfig, analytics: BrowserClient) {
    await beforeSetup();
    getAnalyticsConnector(config.instanceName).identityStore.addIdentityListener((identity) => {
      userChanges(identity.userId);
    });
    expect(this.name).toBe('@amplitude/engagement-browser');
    expect(analytics).toBeDefined();
  });
  const plugin = jest.fn(
    (): EnrichmentPlugin<BrowserClient, BrowserConfig> => ({
      name: '@amplitude/engagement-browser',
      type: 'enrichment',
      setup,
      execute: async (event) => {
        forwarded.push(event);
        return event;
      },
    }),
  );
  const replaySetup = jest.fn().mockResolvedValue(undefined);
  const browserWindow = {
    amplitudeGTM: Object.assign(client, { _iq: { other } }),
    engagement: { plugin },
    sessionReplay: { plugin: () => ({ name: 'session-replay', type: 'enrichment', setup: replaySetup }) },
    _amplitude: undefined as unknown as (name: string, command: string, ...args: unknown[]) => Promise<void>,
  };
  // Render the production wrapper, substituting only the bundled SDK globals.
  runInNewContext(source, { window: browserWindow, version: 'test-version', console, setTimeout, clearTimeout });
  const initialize = (guidesSurveys = true, options: Record<string, unknown> = {}, name: keyof typeof clients = '') =>
    browserWindow._amplitude(name, 'init', 'test-api-key', {
      instanceName: name ? `${instanceName}-${name}` : instanceName,
      userId: 'initial-user',
      identityStorage: 'none',
      defaultTracking: false,
      autocapture: false,
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      offline: undefined,
      logLevel: 0,
      flushQueueSize: 1,
      flushIntervalMillis: 0,
      guidesSurveys,
      ...options,
    });
  const track = async (name = '', eventType = 'test-event') => {
    await clients[name as keyof typeof clients].track(eventType).promise;
  };
  return {
    client,
    other,
    forwarded,
    delivered,
    setup,
    plugin,
    beforeSetup,
    userChanges,
    replaySetup,
    initialize,
    track,
  };
}

test('first init and three reinitializations forward once to G&S and the Analytics destination', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    await h.initialize();
    await h.track('', `event-${i}`);
  }
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['event-0', 'event-1', 'event-2', 'event-3']);
  expect(h.delivered.map((event) => event.event_type)).toEqual(['event-0', 'event-1', 'event-2', 'event-3']);
  expect(h.delivered.every((event) => event.library === 'amplitude-ts-gtm-snippet/test-version')).toBe(true);
  expect(h.plugin).toHaveBeenCalledTimes(1);
  expect(h.setup).toHaveBeenCalledTimes(1);
  h.userChanges.mockClear();
  h.client.setUserId('restored-user');
  expect(h.userChanges).toHaveBeenCalledTimes(1);
  expect(h.userChanges).toHaveBeenCalledWith('restored-user');
  await h.track('', 'new-user-event');
  expect(h.forwarded[h.forwarded.length - 1].user_id).toBe('restored-user');
  expect(h.delivered[h.delivered.length - 1].user_id).toBe('restored-user');
});

test.each([true, false])('overlapping initialization retains the owner G&S setting %s', async (enabled) => {
  const h = harness();
  const gate = deferred();
  const initSpy = jest.spyOn(h.client, 'init');
  const originalInit = initSpy.getMockImplementation();
  if (!originalInit) throw new Error('Missing Analytics initialization fixture');
  const initialized = deferred();
  initSpy.mockImplementation((...args) => {
    const result = originalInit(...args);
    initialized.resolve();
    return { promise: result.promise.then(() => gate.promise) };
  });
  const owner = h.initialize(enabled);
  await initialized.promise;
  const concurrent = h.initialize(!enabled);
  expect(concurrent).toBe(owner);
  gate.resolve();
  await Promise.all([owner, concurrent]);
  await h.track();
  expect(h.forwarded).toHaveLength(enabled ? 1 : 0);
  expect(h.delivered).toHaveLength(1);
  expect(initSpy).toHaveBeenCalledTimes(1);
});

test('initialization stays pending through restoration and concurrent calls join it', async () => {
  const h = harness();
  await h.initialize();
  const gate = deferred();
  const restoring = deferred();
  const originalAdd = h.client.add.bind(h.client);
  jest.spyOn(h.client, 'add').mockImplementation((plugin) => {
    if (plugin.name === '@amplitude/engagement-browser') {
      restoring.resolve();
      return { promise: gate.promise.then(() => originalAdd(plugin).promise) };
    }
    return originalAdd(plugin);
  });
  const owner = h.initialize();
  await restoring.promise;
  const completed = jest.fn();
  void owner.then(completed);
  expect(h.initialize(false)).toBe(owner);
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  gate.resolve();
  await owner;
  await h.track();
  expect(h.forwarded).toHaveLength(1);
  expect(h.setup).toHaveBeenCalledTimes(1);
});

test.each([false, true])('setup failure rejects and a later Init retries (initialized: %s)', async (initialized) => {
  const h = harness();
  if (initialized) await h.initialize(false);
  const failure = new Error('G&S boot failed');
  h.beforeSetup.mockRejectedValueOnce(failure);
  await expect(h.initialize()).rejects.toBe(failure);
  await h.track('', 'analytics-after-failure');
  expect(h.delivered.map((event) => event.event_type)).toEqual(['analytics-after-failure']);
  expect(h.forwarded).toHaveLength(0);
  await h.initialize();
  await h.track('', 'after-retry');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['after-retry']);
  expect(h.setup).toHaveBeenCalledTimes(2);
  expect(h.plugin).toHaveBeenCalledTimes(1);
  h.userChanges.mockClear();
  h.client.setUserId('after-retry-user');
  expect(h.userChanges).toHaveBeenCalledTimes(1);
});

test('pending setup is shared without a second bootstrap', async () => {
  const h = harness();
  const gate = deferred();
  const setupStarted = deferred();
  h.beforeSetup.mockImplementationOnce(() => {
    setupStarted.resolve();
    return gate.promise;
  });
  const initialized = h.initialize();
  await setupStarted.promise;
  const concurrent = h.initialize();
  expect(concurrent).toBe(initialized);
  gate.resolve();
  await initialized;
  await h.initialize();
  expect(h.setup).toHaveBeenCalledTimes(1);
});

test('disabled initialization removes forwarding and re-enabling reuses successful setup', async () => {
  const h = harness();
  await h.initialize(false);
  await h.track('', 'initially-disabled');
  expect(h.plugin).not.toHaveBeenCalled();
  await h.initialize();
  await h.track('', 'enabled');
  await h.initialize(false);
  await h.track('', 'disabled');
  await h.initialize();
  await h.track('', 'enabled-again');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['enabled', 'enabled-again']);
  expect(h.delivered).toHaveLength(4);
  expect(h.setup).toHaveBeenCalledTimes(1);
});

test('separate clients retain their own registration and initialization', async () => {
  const h = harness();
  await Promise.all([h.initialize(), h.initialize(true, {}, 'other')]);
  await h.initialize();
  await h.track('', 'default');
  await h.track('other', 'named');
  expect(h.forwarded.map((event) => event.event_type)).toEqual(['default', 'named']);
  expect(h.delivered).toHaveLength(2);
  expect(h.plugin).toHaveBeenCalledTimes(2);
  expect(h.setup).toHaveBeenCalledTimes(2);
});

test('Session Replay and legacy enrichment keep their first-init behavior', async () => {
  const h = harness();
  await h.initialize(true, {
    sessionReplay: true,
    pageViewLegacy: true,
    userAgentEnrichmentOptions: {},
  });
  await h.track('', '[Amplitude] Page Viewed');
  expect(h.replaySetup).toHaveBeenCalledTimes(1);
  expect(h.delivered[0].event_type).toBe('Page View');
  expect(h.forwarded[0].event_type).toBe('Page View');
});

test('a rejected registration is unlocked before the next Init retries', async () => {
  const h = harness();
  await h.initialize(false);
  const failure = new Error('registration failed');
  const originalAdd = h.client.add.bind(h.client);
  let rejectRegistration = true;
  jest.spyOn(h.client, 'add').mockImplementation((plugin) => {
    if (plugin.name === '@amplitude/engagement-browser' && rejectRegistration) {
      rejectRegistration = false;
      return originalAdd({
        ...plugin,
        setup: async () => {
          throw failure;
        },
      });
    }
    return originalAdd(plugin);
  });
  await expect(h.initialize()).rejects.toBe(failure);
  await h.initialize();
  await h.track();
  expect(h.forwarded).toHaveLength(1);
  expect(h.delivered).toHaveLength(1);
  expect(h.setup).toHaveBeenCalledTimes(1);
});

test('an Analytics initialization rejection releases the owning operation', async () => {
  const h = harness();
  const failure = new Error('Analytics initialization failed');
  jest.spyOn(h.client, 'init').mockReturnValueOnce({ promise: Promise.reject(failure) });
  await expect(h.initialize(false)).rejects.toBe(failure);
  await h.initialize();
  await h.track();
  expect(h.forwarded).toHaveLength(1);
  expect(h.delivered).toHaveLength(1);
});

test('wrapper configuration still converts regular expressions and removes template-only fields', async () => {
  const h = harness();
  const initSpy = jest.spyOn(h.client, 'init').mockReturnValue({ promise: Promise.resolve() });
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await h.initialize(false, {
    autocapture: {
      attribution: { excludeReferrersText: ['example.com'], excludeReferrersRegex: ['^internal', '['] },
      elementInteractions: {
        pageUrlAllowlistString: ['/home'],
        pageUrlAllowlistRegex: ['dashboard$'],
        dataAttributePrefixString: ['data-test'],
        dataAttributePrefixRegex: ['^data-custom'],
      },
      networkTracking: { captureRules: [{ urls: ['/api'], urlsRegex: ['v1$'] }, { urlsRegex: [] }] },
    },
  });
  expect(initSpy.mock.calls[0][1]).toMatchObject({
    autocapture: {
      attribution: { excludeReferrers: ['example.com', /^internal/] },
      elementInteractions: {
        pageUrlAllowlist: ['/home', /dashboard$/],
        dataAttributePrefix: ['data-test', /^data-custom/],
      },
      networkTracking: { captureRules: [{ urls: ['/api', /v1$/] }, {}] },
    },
  });
  const configuration = initSpy.mock.calls[0][1];
  expect(JSON.stringify(configuration)).not.toMatch(
    /excludeReferrersText|excludeReferrersRegex|urlsRegex|AllowlistString/,
  );
  expect(error).toHaveBeenCalledTimes(1);
});
