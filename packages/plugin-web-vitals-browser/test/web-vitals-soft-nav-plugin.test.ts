import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';
import { webVitalsPlugin, webVitalsSoftNavPlugin } from '../src';
import { PLUGIN_NAME, SOFT_NAV_FLUSH_DELAY_MS } from '../src/constants';

/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

// Mock web-vitals
jest.mock('web-vitals', () => ({
  onLCP: jest.fn(),
  onINP: jest.fn(),
  onCLS: jest.fn(),
  onFCP: jest.fn(),
  onTTFB: jest.fn(),
}));

// Mock getGlobalScope
jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));

/**
 * The plugin reads the global `performance`, so pin its time origin to keep timestamps stable.
 * Fake timers swap out the global `performance`, so this needs to be re-applied after enabling them.
 */
const pinTimeOrigin = () => {
  Object.defineProperty(globalThis.performance, 'timeOrigin', { value: 1000, configurable: true });
};

describe('webVitalsSoftNavPlugin', () => {
  let amplitude: BrowserClient;
  let config: any;
  let mockDocument: Document;
  let mockPerformance: Performance;
  let mockGlobalScope: typeof globalThis;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDocument = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      visibilityState: 'visible',
      title: 'Example Page',
    } as unknown as Document;

    mockPerformance = {
      timeOrigin: 1000,
    } as unknown as Performance;

    pinTimeOrigin();

    mockGlobalScope = {
      document: mockDocument,
      performance: mockPerformance,
      location: {
        href: 'https://www.example.com/path/to?query=value#hash',
      },
    } as unknown as typeof globalThis;

    (getGlobalScope as jest.Mock).mockReturnValue(mockGlobalScope);

    amplitude = {
      track: jest.fn(),
    } as unknown as BrowserClient;

    config = {
      loggerProvider: {
        log: jest.fn(),
        debug: jest.fn(),
      },
    };
  });

  /**
   * Calls each of the five web vitals callbacks registered by the plugin with `metric`.
   */
  const reportAllMetrics = (metric: Record<string, unknown>) => {
    for (const onMetric of [onLCP, onFCP, onINP, onCLS, onTTFB]) {
      const callback = (onMetric as jest.Mock).mock.calls[0][0];
      /* istanbul ignore else */
      if (callback) {
        callback(metric);
      }
    }
  };

  const getVisibilityListener = () => (mockDocument.addEventListener as jest.Mock).mock.calls[0][1];

  const hideDocument = () => {
    Object.defineProperty(mockDocument, 'visibilityState', { value: 'hidden' });
    getVisibilityListener()();
  };

  const makeMetric = (overrides: Record<string, unknown> = {}) => ({
    value: 100,
    rating: 'good',
    delta: 0,
    navigationType: 'navigate',
    id: 'test-id',
    navigationId: 1,
    entries: [{ startTime: 0 }],
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    pinTimeOrigin();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as Window & { PerformanceSoftNavigation?: unknown }).PerformanceSoftNavigation;
  });

  const setSoftNavSupported = (supported: boolean) => {
    if (supported) {
      Object.defineProperty(window, 'PerformanceSoftNavigation', {
        value: function PerformanceSoftNavigation() {
          /* noop */
        },
        configurable: true,
      });
      return;
    }

    delete (window as Window & { PerformanceSoftNavigation?: unknown }).PerformanceSoftNavigation;
  };

  it('should be used when reportSoftNav is enabled and soft navigation is supported', async () => {
    setSoftNavSupported(true);
    const plugin = webVitalsPlugin({ reportSoftNav: true });
    await plugin?.setup?.(config, amplitude);

    for (const onMetric of [onLCP, onFCP, onINP, onCLS, onTTFB]) {
      expect((onMetric as jest.Mock).mock.calls[0][1]).toEqual({ reportSoftNavs: true });
    }
  });

  it('should fall back to the default plugin when soft navigation is not supported', async () => {
    setSoftNavSupported(false);
    const plugin = webVitalsPlugin({ reportSoftNav: true });
    await plugin?.setup?.(config, amplitude);

    for (const onMetric of [onLCP, onFCP, onINP, onCLS, onTTFB]) {
      expect((onMetric as jest.Mock).mock.calls[0][1]).toBeUndefined();
    }
  });

  it('should have the correct name and type', () => {
    const plugin = webVitalsSoftNavPlugin();
    expect(plugin.name).toBe(PLUGIN_NAME);
    expect(plugin.type).toBe('enrichment');
  });

  it('should not setup if document is not available', async () => {
    (getGlobalScope as jest.Mock).mockReturnValue({});
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);
    expect(onLCP).not.toHaveBeenCalled();
  });

  it('should not setup if globalScope is not available', async () => {
    (getGlobalScope as jest.Mock).mockReturnValue(undefined);
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);
    expect(onLCP).not.toHaveBeenCalled();
  });

  it('should opt in to soft navigation reporting for every metric', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    for (const onMetric of [onLCP, onFCP, onINP, onCLS, onTTFB]) {
      expect((onMetric as jest.Mock).mock.calls[0][1]).toEqual({ reportSoftNavs: true });
    }
  });

  it('should include the navigation start of the reported navigation', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(
      makeMetric({
        navigationId: 4,
        navigationType: 'soft-navigation',
        navigationStartTime: 500,
        navigationURL: 'https://www.example.com/soft-nav',
      }),
    );
    hideDocument();

    const [, eventObject] = (amplitude.track as jest.Mock).mock.calls[0];
    expect(eventObject['[Amplitude] LCP']).toMatchObject({
      navigationType: 'soft-navigation',
      // performance.timeOrigin (1000) + navigationStartTime (500)
      navigationStart: 1500,
    });
  });

  it('should use the page properties of the navigation the metrics belong to', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(
      makeMetric({
        navigationId: 2,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/1?ref=home',
      }),
    );
    hideDocument();

    const [, eventObject] = (amplitude.track as jest.Mock).mock.calls[0];
    expect(eventObject).toMatchObject({
      '[Amplitude] Page Domain': 'www.example.com',
      '[Amplitude] Page Location': 'https://www.example.com/products/1?ref=home',
      '[Amplitude] Page Path': '/products/1',
      '[Amplitude] Page URL': 'https://www.example.com/products/1',
    });
  });

  it('should send one event per navigation once a later navigation reports metrics', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(makeMetric({ navigationId: 1, navigationURL: 'https://www.example.com/' }));

    // The first navigation is not reported while it is still the current one.
    jest.advanceTimersByTime(SOFT_NAV_FLUSH_DELAY_MS * 2);
    expect(amplitude.track as jest.Mock).not.toHaveBeenCalled();

    reportAllMetrics(
      makeMetric({
        navigationId: 2,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/1',
      }),
    );

    // The superseded navigation is sent after the grace period, the current one is not.
    expect(amplitude.track as jest.Mock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(SOFT_NAV_FLUSH_DELAY_MS);
    expect((amplitude.track as jest.Mock).mock.calls).toHaveLength(1);
    expect((amplitude.track as jest.Mock).mock.calls[0][1]).toMatchObject({
      '[Amplitude] Page Location': 'https://www.example.com/',
    });

    // The current navigation is sent when the page is hidden.
    hideDocument();
    expect((amplitude.track as jest.Mock).mock.calls).toHaveLength(2);
    expect((amplitude.track as jest.Mock).mock.calls[1][1]).toMatchObject({
      '[Amplitude] Page Location': 'https://www.example.com/products/1',
    });
  });

  it('should send every navigation when several soft navigations happen in quick succession', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(makeMetric({ navigationId: 1, navigationURL: 'https://www.example.com/' }));
    reportAllMetrics(
      makeMetric({
        navigationId: 2,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/1',
      }),
    );

    // A third navigation starts before the pending flush fires, restarting the grace period.
    jest.advanceTimersByTime(SOFT_NAV_FLUSH_DELAY_MS / 2);
    reportAllMetrics(
      makeMetric({
        navigationId: 3,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/2',
      }),
    );
    expect(amplitude.track as jest.Mock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SOFT_NAV_FLUSH_DELAY_MS);
    expect((amplitude.track as jest.Mock).mock.calls.map((call) => call[1]['[Amplitude] Page Location'])).toEqual([
      'https://www.example.com/',
      'https://www.example.com/products/1',
    ]);

    hideDocument();
    expect((amplitude.track as jest.Mock).mock.calls[2][1]).toMatchObject({
      '[Amplitude] Page Location': 'https://www.example.com/products/2',
    });
  });

  it('should include metrics reported late for a superseded navigation', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    const lcpCallback = (onLCP as jest.Mock).mock.calls[0][0];
    const clsCallback = (onCLS as jest.Mock).mock.calls[0][0];
    const inpCallback = (onINP as jest.Mock).mock.calls[0][0];

    lcpCallback(makeMetric({ navigationId: 1, navigationURL: 'https://www.example.com/' }));
    inpCallback(
      makeMetric({
        navigationId: 2,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/1',
      }),
    );
    // CLS for the first navigation is finalized just after the soft navigation starts.
    clsCallback(makeMetric({ navigationId: 1, navigationURL: 'https://www.example.com/', value: 0.25 }));

    jest.advanceTimersByTime(SOFT_NAV_FLUSH_DELAY_MS);

    expect((amplitude.track as jest.Mock).mock.calls).toHaveLength(1);
    const [, eventObject] = (amplitude.track as jest.Mock).mock.calls[0];
    expect(eventObject['[Amplitude] LCP']).toBeDefined();
    expect(eventObject['[Amplitude] CLS']).toMatchObject({ value: 0.25 });
    expect(eventObject['[Amplitude] INP']).toBeUndefined();
  });

  it('should keep listening for visibility changes and not send empty events', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(makeMetric({ navigationId: 1, navigationURL: 'https://www.example.com/' }));
    hideDocument();
    expect((amplitude.track as jest.Mock).mock.calls).toHaveLength(1);
    expect(mockDocument.removeEventListener).not.toHaveBeenCalled();

    // Nothing new to report: no event is sent.
    hideDocument();
    expect((amplitude.track as jest.Mock).mock.calls).toHaveLength(1);

    // A later navigation is still reported after the page becomes visible again.
    reportAllMetrics(
      makeMetric({
        navigationId: 2,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/1',
      }),
    );
    hideDocument();
    expect((amplitude.track as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('should clear a pending flush on teardown', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(makeMetric({ navigationId: 1, navigationURL: 'https://www.example.com/' }));
    reportAllMetrics(
      makeMetric({
        navigationId: 2,
        navigationType: 'soft-navigation',
        navigationURL: 'https://www.example.com/products/1',
      }),
    );

    await plugin?.teardown?.();
    jest.advanceTimersByTime(SOFT_NAV_FLUSH_DELAY_MS * 2);

    expect(amplitude.track as jest.Mock).not.toHaveBeenCalled();
    expect(mockDocument.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('should fall back to the current URL when the metric has no navigation URL', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(makeMetric({ navigationId: 1, navigationURL: undefined }));
    hideDocument();

    const [, eventObject] = (amplitude.track as jest.Mock).mock.calls[0];
    expect(eventObject).toMatchObject({
      '[Amplitude] Page Location': 'https://www.example.com/path/to?query=value#hash',
    });
  });

  it('should not throw when the navigation URL cannot be parsed', async () => {
    const plugin = webVitalsSoftNavPlugin();
    await plugin?.setup?.(config, amplitude);

    reportAllMetrics(makeMetric({ navigationId: 1, navigationURL: 'not a url' }));
    hideDocument();

    const [, eventObject] = (amplitude.track as jest.Mock).mock.calls[0];
    expect(eventObject['[Amplitude] Page Domain']).toBe('');
    expect(eventObject['[Amplitude] Page Location']).toBe('not a url');
    expect(config.loggerProvider.debug).toHaveBeenCalled();
  });

  it('should pass through events in execute', async () => {
    const plugin = webVitalsSoftNavPlugin();
    const event = { event_type: 'test' };
    const result = await plugin?.execute?.(event);
    expect(result).toBe(event);
  });
});
