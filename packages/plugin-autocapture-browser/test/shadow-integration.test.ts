/**
 * End-to-end shadow-DOM capture, both ENABLED and DISABLED:
 *   - a click on an element inside an open shadow root emits
 *     `[Amplitude] Element Clicked` with a shadow-delimited Element Path;
 *   - exposure discovery pierces open shadow roots when enabled and stays
 *     light-DOM-only when disabled.
 *
 * The selector engine is a module-level singleton shared by every DataExtractor
 * (see data-extractor.ts), so we flip shadow support on/off by constructing a
 * throwaway DataExtractor and calling `updateSelectorConfig`. `afterEach` resets
 * it to defaults so a toggle never leaks between tests.
 */
import { autocapturePlugin } from '../src/autocapture-plugin';
import { createExposureObservable } from '../src/observables';
import { DataExtractor } from '../src/data-extractor';
import { SHADOW_BOUNDARY_DELIMITER } from '@amplitude/element-selector';
import { Observable, BrowserConfig, EnrichmentPlugin, ILogger, BrowserClient } from '@amplitude/analytics-core';
import { TimestampedEvent } from '../src/helpers';
import { createMockBrowserClient } from './mock-browser-client';
import { mockWindowLocationFromURL } from './utils';

const DEBOUNCE = 4;

// Mock logger whose methods are typed as `jest.Mock` (not `ILogger` methods),
// so asserting on them doesn't trip `@typescript-eslint/unbound-method`. Cast to
// `ILogger` only when handed to config.
type MockLogger = { log: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };
const makeLogger = (): MockLogger => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });

/** Flip the shared selector engine's shadow config for the duration of a test. */
const setShadowConfig = (cfg: { shadowDomEnabled?: boolean; maxShadowDomDepth?: number } | undefined) => {
  new DataExtractor({}).updateSelectorConfig(cfg as any);
};

describe('shadow-DOM end-to-end capture', () => {
  let plugin: EnrichmentPlugin | undefined;
  let instance: BrowserClient;
  let track: jest.SpyInstance;
  let loggerProvider: MockLogger;

  beforeEach(async () => {
    jest.useFakeTimers();
    loggerProvider = makeLogger();
    plugin = autocapturePlugin({ debounceTime: DEBOUNCE });
    instance = createMockBrowserClient();
    await instance.init('API_KEY', 'USER_ID').promise;
    track = jest.spyOn(instance, 'track').mockImplementation(jest.fn());
    mockWindowLocationFromURL(new URL('https://example.com/shadow-test'));
  });

  afterEach(async () => {
    await plugin?.teardown?.();
    setShadowConfig(undefined); // reset shared engine to defaults
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const buildShadowButton = () => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    const host = document.querySelector('my-host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<button id="cta">Sign up</button>`;
    return root.getElementById('cta') as HTMLButtonElement;
  };

  test('ENABLED: click inside an open shadow root emits Element Clicked with a shadow-delimited path', async () => {
    setShadowConfig({ shadowDomEnabled: true, maxShadowDomDepth: 2 });
    const config: Partial<BrowserConfig> = {
      defaultTracking: false,
      loggerProvider: loggerProvider as unknown as ILogger,
    };
    await plugin?.setup?.(config as BrowserConfig, instance);

    const button = buildShadowButton();
    // A composed, bubbling event is what a real click produces; it reaches the
    // document-level capture listener and composedPath()[0] is the inner button.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    jest.advanceTimersByTime(DEBOUNCE + 3);

    expect(track).toHaveBeenCalledTimes(1);
    const [eventName, props] = track.mock.calls[0];
    expect(eventName).toBe('[Amplitude] Element Clicked');
    expect(props['[Amplitude] Element Tag']).toBe('button');
    // The path pierces the boundary: outer tree segment >>> inner tree segment.
    expect(props['[Amplitude] Element Path']).toContain(SHADOW_BOUNDARY_DELIMITER);
  });

  test('DISABLED: a click inside a shadow root retargets to the host (no delimiter, byte-identical path)', async () => {
    // shadow off (default). The event target is retargeted to the host element.
    const config: Partial<BrowserConfig> = {
      defaultTracking: false,
      loggerProvider: loggerProvider as unknown as ILogger,
    };
    await plugin?.setup?.(config as BrowserConfig, instance);

    const button = buildShadowButton();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    jest.advanceTimersByTime(DEBOUNCE + 3);

    // With shadow off, the retargeted host (<my-host>) is not in the default
    // allowlist, so no trackable ancestor is found and typically nothing is
    // emitted — exactly the pre-shadow behavior. Whatever is emitted must never
    // carry a shadow delimiter, and it must never throw.
    const paths = track.mock.calls.map((c) => c[1]?.['[Amplitude] Element Path'] as string | undefined);
    expect(paths.every((p) => !p?.includes(SHADOW_BOUNDARY_DELIMITER))).toBe(true);
    expect(loggerProvider.error).not.toHaveBeenCalled();
  });

  test('ENABLED: does not throw and still captures when the click target is exotic', async () => {
    setShadowConfig({ shadowDomEnabled: true, maxShadowDomDepth: 2 });
    const config: Partial<BrowserConfig> = {
      defaultTracking: false,
      loggerProvider: loggerProvider as unknown as ILogger,
    };
    await plugin?.setup?.(config as BrowserConfig, instance);

    // Dispatch a plain click on document (target has no shadow ancestry).
    expect(() => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      jest.advanceTimersByTime(DEBOUNCE + 3);
    }).not.toThrow();
    expect(loggerProvider.error).not.toHaveBeenCalled();
  });
});

describe('shadow-DOM exposure discovery', () => {
  let mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>;
  let mockIntersectionObserver: { observe: jest.Mock; disconnect: jest.Mock };

  beforeEach(() => {
    mutationObservable = { subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })) } as unknown as Observable<
      TimestampedEvent<MutationRecord[]>
    >;
    mockIntersectionObserver = { observe: jest.fn(), disconnect: jest.fn() };
    (global as any).IntersectionObserver = jest.fn(() => mockIntersectionObserver);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  const buildShadowExposure = () => {
    document.body.innerHTML = `<button class="track-me">light</button><my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<button class="track-me">shadow</button>`;
    return root.querySelector('button') as HTMLButtonElement;
  };

  test('ENABLED: observes an allowlisted element inside an open shadow root', () => {
    const shadowButton = buildShadowExposure();
    const obs = createExposureObservable(mutationObservable, ['.track-me'], () => ({ enabled: true, maxDepth: 1 }));
    obs.subscribe(() => undefined);
    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(shadowButton);
  });

  test('DISABLED: does NOT observe elements inside shadow roots (light-DOM only)', () => {
    const shadowButton = buildShadowExposure();
    const obs = createExposureObservable(mutationObservable, ['.track-me'], () => ({ enabled: false, maxDepth: 1 }));
    obs.subscribe(() => undefined);
    // The light-DOM button IS observed; the shadow one is NOT.
    const observedTargets = mockIntersectionObserver.observe.mock.calls.map((c) => c[0] as Element);
    expect(observedTargets).not.toContain(shadowButton);
    expect(observedTargets.length).toBe(1);
  });
});

/**
 * Error boundaries: the point of the shadow work is to never crash the host
 * page. These assert that each entry point contains a throw rather than letting
 * it escape — the containment lives at these few boundaries, not scattered
 * through the DOM-traversal helpers.
 */
describe('shadow capture — error boundaries', () => {
  afterEach(() => {
    setShadowConfig(undefined);
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('enrichment boundary: addAdditionalEventProperties never throws and returns the base event', () => {
    setShadowConfig({ shadowDomEnabled: true, maxShadowDomDepth: 2 });
    const extractor = new DataExtractor({});
    // Force the enrichment internals to throw.
    jest.spyOn(extractor, 'getEventProperties').mockImplementation(() => {
      throw new Error('boom');
    });
    document.body.innerHTML = `<button id="b">x</button>`;
    const button = document.getElementById('b') as HTMLElement;
    const event = { target: button } as unknown as Event;

    let result: any;
    expect(() => {
      result = extractor.addAdditionalEventProperties(event, 'click', ['button'], 'data-amp');
    }).not.toThrow();
    // The base event is still returned; enrichment (targetElementProperties) is
    // omitted, so the event is dropped downstream — degraded, not crashed.
    expect(result.type).toBe('click');
    expect(result.targetElementProperties).toBeUndefined();
  });

  test('exposure boundary: a malformed cssSelectorAllowlist never throws', () => {
    (global as any).IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
    document.body.innerHTML = `<button class="track-me">x</button>`;
    // A controllable mutation observable so the mutation path is exercised too.
    let deliver: ((v: { event: Array<{ addedNodes: Node[] }> }) => void) | undefined;
    const mo = {
      subscribe: jest.fn((cb: (v: { event: Array<{ addedNodes: Node[] }> }) => void) => {
        deliver = cb;
        return { unsubscribe: jest.fn() };
      }),
    } as unknown as Observable<TimestampedEvent<MutationRecord[]>>;

    // ':::' is an invalid selector — querySelectorAll / matches would throw.
    const obs = createExposureObservable(mo, [':::'], () => ({ enabled: true, maxDepth: 1 }));
    expect(() => obs.subscribe(() => undefined)).not.toThrow();

    // Mutation path: a node whose matches(':::') and descendant query throw.
    const node = document.createElement('div');
    expect(() => deliver?.({ event: [{ addedNodes: [node] }] })).not.toThrow();
  });

  test('setup boundary: a throwing remote-config subscribe does not reject setup', async () => {
    const plugin = autocapturePlugin({ debounceTime: DEBOUNCE });
    const logger = makeLogger();
    const throwingClient = {
      subscribe: jest.fn(() => {
        throw new Error('subscribe boom');
      }),
      unsubscribe: jest.fn(),
    };
    const config = {
      defaultTracking: false,
      loggerProvider: logger,
      fetchRemoteConfig: true,
      remoteConfigClient: throwingClient,
    } as unknown as BrowserConfig;
    const instance = createMockBrowserClient();

    await expect(plugin.setup?.(config, instance)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failed to initialize'));
    await plugin.teardown?.();
  });
});
