import {
  BrowserConfig,
  BASE_CAMPAIGN,
  CampaignParser,
  CookieStorage,
  FetchTransport,
  LogLevel,
  EnrichmentPlugin,
  Logger,
  clearPageViewState,
  clearSdkInitializationOffset,
} from '@amplitude/analytics-core';
import { pageViewTrackingPlugin } from '../src/page-view-tracking';
import { Options } from '../src/typings/page-view-tracking';
import { createMockBrowserClient } from './mock-browser-client';

// Exercise the native history implementation: the URL changes inside the wrapped call.
describe('page view history tracking', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalPushState = window.history.pushState;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalReplaceState = window.history.replaceState;
  const config: BrowserConfig = {
    apiKey: 'history-test',
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
    offline: false,
    optOut: false,
    serverUrl: undefined,
    transportProvider: new FetchTransport(),
    useBatch: false,
    cookieOptions: {
      domain: '.amplitude.com',
      expiration: 365,
      sameSite: 'Lax',
      secure: false,
      upgrade: true,
    },
    cookieStorage: new CookieStorage(),
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
    pageCounter: 0,
  };
  let plugins: EnrichmentPlugin[];

  const install = async (options: Options = {}, apiKey = config.apiKey) => {
    const client = createMockBrowserClient();
    const plugin = pageViewTrackingPlugin(options);
    plugins.push(plugin);
    await plugin.setup?.({ ...config, apiKey }, client);
    return { client, plugin };
  };

  // Campaign parsing and page view creation complete asynchronously.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const locations = (client: ReturnType<typeof createMockBrowserClient>) =>
    client.track.mock.calls.map(([event]) =>
      typeof event === 'object' ? (event.event_properties?.['[Amplitude] Page Location'] as unknown) : undefined,
    );

  beforeEach(() => {
    plugins = [];
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.history.replaceState(null, '', '/home');
    clearPageViewState();
    clearSdkInitializationOffset();
    window.sessionStorage.clear();
  });

  afterEach(async () => {
    for (const plugin of plugins) {
      await plugin.teardown?.();
    }
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
  });

  test.each([undefined, 'all', 'pathOnly'] as const)(
    'tracks replaceState routes with %s',
    async (trackHistoryChanges) => {
      const { client } = await install({ trackHistoryChanges });
      expect(window.history.replaceState({ route: true }, '', new URL('/settings', location.href))).toBeUndefined();
      await settle();

      expect(locations(client)).toEqual(['http://localhost/home', 'http://localhost/settings']);
      expect(client.track.mock.calls[1][0]).toMatchObject({ event_type: '[Amplitude] Page Viewed' });
      expect(window.history.state).toEqual({ route: true });
    },
  );

  test('ignores hydration, state-only, omitted, null, and unchanged URLs', async () => {
    const trackOn = jest.fn(() => true);
    const { client } = await install({ trackOn });
    window.history.replaceState({ idx: 0 }, '');
    window.history.replaceState({ idx: 1 }, '', null);
    window.history.replaceState({ idx: 2 }, '', '');
    window.history.replaceState({ idx: 3 }, '', '/home');
    window.history.replaceState({ idx: 4 }, '', location.href);
    await settle();
    expect(locations(client)).toEqual(['http://localhost/home']);

    // An unobserved hash change must not turn a subsequent state-only update into a navigation.
    location.hash = 'anchor';
    window.history.replaceState({ idx: 5 }, '');
    expect(trackOn).toHaveBeenCalledTimes(1);
    await settle();
  });

  test.each(['all', 'pathOnly'] as const)('filters query and hash changes with %s', async (trackHistoryChanges) => {
    window.history.replaceState(null, '', '/home?tracking=1');
    const { client } = await install({ trackHistoryChanges });
    window.history.replaceState(null, '', '/home'); // Query cleanup is a URL change under "all".
    await settle();
    window.history.replaceState(null, '', '/home#section');
    await settle();
    window.history.replaceState(null, '', '/settings#section');
    await settle();
    expect(locations(client)).toEqual(
      trackHistoryChanges === 'all'
        ? [
            'http://localhost/home?tracking=1',
            'http://localhost/home',
            'http://localhost/home#section',
            'http://localhost/settings#section',
          ]
        : ['http://localhost/home?tracking=1', 'http://localhost/settings#section'],
    );
  });

  test('respects trackOn and advances the URL baseline even when suppressed', async () => {
    let enabled = true;
    const trackOn = jest.fn(() => enabled);
    const { client } = await install({ trackOn });
    enabled = false;
    window.history.replaceState(null, '', '/suppressed');
    await settle();
    enabled = true;
    window.history.pushState(null, '', '/suppressed');
    await settle();
    expect(trackOn).toHaveBeenCalledTimes(2);
    expect(client.track.mock.calls).toHaveLength(1);
    window.history.replaceState(null, '', '/allowed');
    await settle();
    expect(locations(client)).toEqual(['http://localhost/home', 'http://localhost/allowed']);
  });

  test('does not track history changes in attribution mode', async () => {
    const { client } = await install({ trackOn: 'attribution' });
    window.history.replaceState(null, '', '/settings');
    await settle();
    expect(client.track.mock.calls).toHaveLength(0);
  });

  test('deduplicates synchronous replace/push calls to the same URL', async () => {
    const { client } = await install();
    window.history.replaceState(null, '', '/settings');
    window.history.replaceState({ idx: 1 }, '', '/settings');
    window.history.pushState(null, '', '/settings');
    await settle();
    expect(locations(client)).toEqual(['http://localhost/home', 'http://localhost/settings']);
  });

  test('tracks synchronous redirects and subsequent Back navigation', async () => {
    const { client } = await install();
    window.history.replaceState(null, '', '/redirect');
    window.history.replaceState(null, '', '/settings');
    await settle();
    window.history.pushState(null, '', '/next');
    await settle();
    const back = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    window.history.back();
    await back;
    await settle();
    expect(locations(client)).toEqual([
      'http://localhost/home',
      'http://localhost/redirect',
      'http://localhost/settings',
      'http://localhost/next',
      'http://localhost/settings',
    ]);
  });

  test('preserves native exceptions and does not track failed calls', async () => {
    const { client } = await install();
    expect(() => window.history.replaceState(null, '', 'https://other.example/')).toThrow(DOMException);
    expect(() => window.history.replaceState.call({}, null, '', '/settings')).toThrow(TypeError);
    await settle();
    expect(locations(client)).toEqual(['http://localhost/home']);
    window.history.replaceState(null, '', '/settings');
    await settle();
    expect(client.track.mock.calls).toHaveLength(2);
  });

  test.each(['pushState', 'replaceState'] as const)(
    'preserves %s wrapper arguments, receiver, and return value',
    async (method) => {
      const result = { wrapperResult: true };
      const wrapped = jest.fn(function (this: History, ...args: Parameters<History['pushState']>) {
        originalReplaceState.apply(this, args);
        return result;
      });
      window.history[method] = wrapped;
      const { client } = await install();
      const state = { route: true };
      const url = new URL('/settings', location.href);
      expect(window.history[method](state, 'title', url)).toBe(result);
      expect(wrapped).toHaveBeenCalledWith(state, 'title', url);
      expect(wrapped.mock.contexts[0]).toBe(window.history);
      await settle();
      expect(client.track.mock.calls).toHaveLength(2);
    },
  );

  test('keeps later wrappers and other instances active after teardown', async () => {
    const first = await install();
    const second = await install();
    const otherProject = await install({}, 'other-project');
    // Simulate another history consumer installed after the SDK.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const sdkReplaceState = window.history.replaceState;
    const outerWrapper = jest.fn(function (this: History, ...args: Parameters<History['replaceState']>) {
      return sdkReplaceState.apply(this, args);
    });
    window.history.replaceState = outerWrapper;
    window.history.replaceState(null, '', '/shared');
    await settle();
    const pageViewId = (client: typeof first.client): unknown => {
      const event = client.track.mock.calls[1][0];
      return typeof event === 'object' && event.event_properties?.['[Amplitude] Page View ID'];
    };
    expect(pageViewId(first.client)).toEqual(expect.any(String));
    expect(pageViewId(second.client)).toBe(pageViewId(first.client));
    expect(pageViewId(otherProject.client)).not.toBe(pageViewId(first.client));
    await first.plugin.teardown?.();
    window.history.replaceState(null, '', '/settings');
    await settle();
    expect(first.client.track.mock.calls).toHaveLength(2);
    expect(second.client.track.mock.calls).toHaveLength(3);
    expect(otherProject.client.track.mock.calls).toHaveLength(3);
    await second.plugin.teardown?.();
    await otherProject.plugin.teardown?.();
    window.history.replaceState(null, '', '/after-teardown');
    await settle();
    expect(second.client.track.mock.calls).toHaveLength(3);
    expect(otherProject.client.track.mock.calls).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.replaceState).toBe(outerWrapper);
    expect(outerWrapper).toHaveBeenCalledTimes(3);
  });

  test('allows an already pending page view to finish after teardown', async () => {
    const { client, plugin } = await install();
    let finishCampaign: (value: Awaited<ReturnType<CampaignParser['parse']>>) => void = () => undefined;
    jest.spyOn(CampaignParser.prototype, 'parse').mockReturnValueOnce(
      new Promise((resolve) => {
        finishCampaign = resolve;
      }),
    );
    window.history.replaceState(null, '', '/settings');
    await plugin.teardown?.();
    expect(client.track.mock.calls).toHaveLength(1);
    finishCampaign({ ...BASE_CAMPAIGN });
    await settle();
    expect(locations(client)).toEqual(['http://localhost/home', 'http://localhost/settings']);
    window.history.replaceState(null, '', '/after-teardown');
    await settle();
    expect(client.track.mock.calls).toHaveLength(2);
  });
});
