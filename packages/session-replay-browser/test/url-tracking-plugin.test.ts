import {
  createUrlTrackingPlugin,
  subscribeToUrlChanges,
  URLTrackingPluginOptions,
} from '../src/plugins/url-tracking-plugin';
import * as AnalyticsCore from '@amplitude/analytics-core';
import * as Helpers from '../src/helpers';
import { IWindow } from '@amplitude/rrweb-types';

jest.mock('../src/helpers', () => ({
  getPageUrl: jest.fn(),
}));

// Mock interface representing the global scope (window) for testing
interface MockGlobalScope {
  history?: {
    pushState: jest.Mock;
    replaceState: jest.Mock;
  };
  location?: {
    href?: string;
  } | null;
  document?: {
    title?: string;
  } | null;
  addEventListener: jest.Mock<unknown, [string, () => void]>;
  removeEventListener: jest.Mock;
  setInterval: jest.Mock<number, [() => void, number]>;
  clearInterval: jest.Mock;
  innerHeight: number;
  innerWidth: number;
}

// Helper functions for creating test data
const createMockUgcFilterRules = () => [
  { selector: 'test', replacement: 'filtered' },
  { selector: '/test/', replacement: 'filtered' },
];

// Factory function to create a mock global scope with sensible defaults
const createMockGlobalScope = (overrides: Partial<MockGlobalScope> = {}): MockGlobalScope => ({
  history: {
    pushState: jest.fn(),
    replaceState: jest.fn(),
  },
  location: {
    href: 'https://example.com/initial',
  },
  document: {
    title: 'Initial Page',
  },
  addEventListener: jest.fn() as jest.Mock<unknown, [string, () => void]>,
  removeEventListener: jest.fn(),
  setInterval: jest.fn().mockReturnValue(123) as jest.Mock<number, [() => void, number]>,
  clearInterval: jest.fn(),
  innerHeight: 768,
  innerWidth: 1024,
  ...overrides,
});

describe('URL Tracking Plugin', () => {
  let mockCallback: jest.MockedFunction<(...args: unknown[]) => void>;
  let mockGlobalScope: MockGlobalScope;

  // Helper function to call the plugin's observer and return cleanup function
  const callObserver = (
    plugin: ReturnType<typeof createUrlTrackingPlugin>,
    globalScope: MockGlobalScope | undefined,
  ) => {
    if (!plugin.observer || !globalScope)
      return () => {
        // No cleanup needed
      };
    return plugin.observer(mockCallback, globalScope as unknown as IWindow, {});
  };

  beforeEach(() => {
    // Use fake timers for testing intervals and timeouts
    jest.useFakeTimers();
    mockCallback = jest.fn();
    mockGlobalScope = createMockGlobalScope();
    // Mock the global scope to return our test mock
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope as unknown as typeof globalThis);
    // Mock getPageUrl to return the URL as-is (no filtering by default)
    (Helpers.getPageUrl as jest.Mock).mockImplementation((url: string) => url);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (Helpers.getPageUrl as jest.Mock).mockClear();
  });

  describe('subscribeToUrlChanges', () => {
    test('returns no-op cleanup when globalScope is undefined', () => {
      const cb = jest.fn();
      const unsubscribe = subscribeToUrlChanges(undefined, cb);
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    test('returns no-op cleanup when globalScope has no location and cleanup is callable', () => {
      const cb = jest.fn();
      const scopeNoLocation = createMockGlobalScope({ location: undefined as any }) as unknown as Window;
      const unsubscribe = subscribeToUrlChanges(scopeNoLocation, cb);
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    test('invokes callback on pushState with new URL and teardown on unsubscribe', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      const unsubscribe = subscribeToUrlChanges(win, cb);
      expect(cb).not.toHaveBeenCalled();
      win.history.pushState({}, '', 'https://example.com/page1');
      expect(cb).toHaveBeenCalledWith('https://example.com/page1');
      unsubscribe();
      cb.mockClear();
      win.history.pushState({}, '', 'https://example.com/page2');
      expect(cb).not.toHaveBeenCalled();
    });

    test('invokes callback on pushState with null url uses getHref', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      subscribeToUrlChanges(win, cb);
      win.history.pushState({}, '', null as unknown as string);
      expect(cb).toHaveBeenCalledWith('https://example.com/initial');
    });

    test('invokes callback on replaceState', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      subscribeToUrlChanges(win, cb);
      win.history.replaceState({}, '', 'https://example.com/replaced');
      expect(cb).toHaveBeenCalledWith('https://example.com/replaced');
    });

    test('replaceState with null url invokes callback with getHref', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      subscribeToUrlChanges(win, cb);
      win.history.replaceState({}, '', null as unknown as string);
      expect(cb).toHaveBeenCalledWith('https://example.com/initial');
    });

    test('invokes callback on popstate/hashchange with current location.href', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      subscribeToUrlChanges(win, cb);
      const [, popstateListener] = (win.addEventListener as jest.Mock).mock.calls.find(
        (c: [string]) => c[0] === 'popstate',
      ) ?? [undefined, undefined];
      expect(popstateListener).toBeDefined();
      popstateListener?.();
      expect(cb).toHaveBeenCalledWith('https://example.com/initial');
      expect(cb).toHaveBeenCalledTimes(1);
      // Same href is deduped, so a second trigger does not call again
      popstateListener?.();
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test('uses polling when enablePolling option is true and cleanup clears interval', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      const cleanup = subscribeToUrlChanges(win, cb, {
        enablePolling: true,
        pollingInterval: 1000,
      });
      const setIntervalMock = Reflect.get(win, 'setInterval') as jest.Mock;
      expect(setIntervalMock).toHaveBeenCalledWith(expect.any(Function), 1000);
      (setIntervalMock.mock.calls[0][0] as (this: void) => void).call(undefined);
      expect(cb).toHaveBeenCalledWith('https://example.com/initial');
      (cleanup as (this: void) => void).call(undefined);
      expect(Reflect.get(win, 'clearInterval')).toHaveBeenCalledWith(123);
    });

    test('polling cleanup does not call clearInterval when interval id is null', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      (Reflect.get(win, 'setInterval') as jest.Mock).mockReturnValue(null);
      const cleanup = subscribeToUrlChanges(win, cb, {
        enablePolling: true,
        pollingInterval: 1000,
      });
      (cleanup as (this: void) => void).call(undefined);
      expect(Reflect.get(win, 'clearInterval')).not.toHaveBeenCalled();
    });

    test('polling getHref returns empty string when location has no href', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope({ location: {} as any }) as unknown as Window;
      const cleanup = subscribeToUrlChanges(win, cb, {
        enablePolling: true,
        pollingInterval: 1000,
      });
      const setIntervalMock = Reflect.get(win, 'setInterval') as jest.Mock;
      (setIntervalMock.mock.calls[0][0] as (this: void) => void).call(undefined);
      expect(cb).toHaveBeenCalledWith('');
      (cleanup as (this: void) => void).call(undefined);
    });

    test('adds second subscriber to same scope and notifies both', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      const win = createMockGlobalScope() as unknown as Window;
      subscribeToUrlChanges(win, cb1);
      subscribeToUrlChanges(win, cb2);
      const history = Reflect.get(win, 'history') as
        | { pushState: (state: unknown, title: string, url?: string) => void }
        | undefined;
      history?.pushState.call(history, {}, '', 'https://example.com/page1');
      expect(cb1).toHaveBeenCalledWith('https://example.com/page1');
      expect(cb2).toHaveBeenCalledWith('https://example.com/page1');
    });

    test('notifies via popstate when history or pushState/replaceState is missing', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope({ history: undefined }) as unknown as Window;
      subscribeToUrlChanges(win, cb);
      const [, popstateListener] = (win.addEventListener as jest.Mock).mock.calls.find(
        (c: [string]) => c[0] === 'popstate',
      ) ?? [undefined, undefined];
      expect(popstateListener).toBeDefined();
      popstateListener?.();
      expect(cb).toHaveBeenCalledWith('https://example.com/initial');
    });

    test('getHref uses empty string when location has no href (event-based path)', () => {
      const cb = jest.fn();
      const win = createMockGlobalScope({ location: {} as any }) as unknown as Window;
      subscribeToUrlChanges(win, cb);
      const [, popstateListener] = (win.addEventListener as jest.Mock).mock.calls.find(
        (c: [string]) => c[0] === 'popstate',
      ) ?? [undefined, undefined];
      popstateListener?.();
      expect(cb).toHaveBeenCalledWith('');
    });
  });

  describe('plugin creation', () => {
    test('should create plugin with default options', () => {
      const plugin = createUrlTrackingPlugin();
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('amplitude/url-tracking@1');
      expect(plugin.observer).toBeDefined();
      expect(plugin.options).toEqual({});
    });
    test('should create plugin with custom options', () => {
      const options: URLTrackingPluginOptions = {
        ugcFilterRules: createMockUgcFilterRules(),
        enablePolling: true,
        pollingInterval: 2000,
        captureDocumentTitle: false,
      };
      const plugin = createUrlTrackingPlugin(options);
      expect(plugin.options).toEqual(options);
    });
  });

  describe('observer', () => {
    test('should emit initial URL and return cleanup function', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
    test('should stop tracking when cleanup is called', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      cleanup();
      mockGlobalScope.history?.pushState({}, '', '/after-cleanup');
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('History API + Hash routing mode (scenario 2)', () => {
    test('should detect URL changes via pushState', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/new-page';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'New Page';
      // Trigger pushState which should be patched by the plugin
      mockGlobalScope.history?.pushState({}, '', '/new-page');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/new-page',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
    test('should detect URL changes via replaceState', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/replaced-page';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Replaced Page';
      // Trigger replaceState which should be patched by the plugin
      mockGlobalScope.history?.replaceState({}, '', '/replaced-page');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/replaced-page',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
    test('should detect URL changes via popstate event', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/back-page';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Back Page';
      // Find and trigger the popstate event listener that was registered by the plugin
      const popstateCall = mockGlobalScope.addEventListener.mock.calls.find(([event]) => event === 'popstate');
      const popstateListener = popstateCall?.[1];
      if (popstateListener) popstateListener();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/back-page',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
    test('should not emit duplicate URL changes', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Try to navigate to the same URL - should not trigger callback
      mockGlobalScope.history?.pushState({}, '', '/initial');
      expect(mockCallback).not.toHaveBeenCalled();
      cleanup();
    });
    test('should include viewport dimensions in URL change events', () => {
      // Update viewport dimensions
      mockGlobalScope.innerHeight = 600;
      mockGlobalScope.innerWidth = 800;
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/viewport-test';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Viewport Test';
      mockGlobalScope.history?.pushState({}, '', '/viewport-test');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/viewport-test',
        title: '', // Default behavior: no document title capture
        viewportHeight: 600,
        viewportWidth: 800,
        type: 'url-change-event',
      });
      cleanup();
    });
  });

  describe('hash routing detection (scenario 2)', () => {
    test('should detect URL changes via hashchange event', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/page#new-hash';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Hash Page';
      // Find and trigger the hashchange event listener that was registered by the plugin
      const hashchangeCall = mockGlobalScope.addEventListener.mock.calls.find(([event]) => event === 'hashchange');
      const hashchangeListener = hashchangeCall?.[1];
      if (hashchangeListener) hashchangeListener();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/page#new-hash',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should detect hash changes with document title capture enabled', () => {
      const plugin = createUrlTrackingPlugin({ captureDocumentTitle: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/page#new-hash';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Hash Page';
      // Find and trigger the hashchange event listener
      const hashchangeCall = mockGlobalScope.addEventListener.mock.calls.find(([event]) => event === 'hashchange');
      const hashchangeListener = hashchangeCall?.[1];
      if (hashchangeListener) hashchangeListener();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/page#new-hash',
        title: 'Hash Page', // Document title captured when enabled
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should not emit duplicate hash changes', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Find the hashchange event listener
      const hashchangeCall = mockGlobalScope.addEventListener.mock.calls.find(([event]) => event === 'hashchange');
      const hashchangeListener = hashchangeCall?.[1];
      expect(hashchangeListener).toBeDefined();
      // Trigger hashchange with same URL - should not trigger callback
      if (hashchangeListener) {
        hashchangeListener();
      }
      expect(mockCallback).not.toHaveBeenCalled();
      cleanup();
    });

    test('should handle hash changes in fallback mode (no history API)', () => {
      const scope = createMockGlobalScope({ history: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      mockCallback.mockClear();
      // Simulate URL change
      if (scope.location) scope.location.href = 'https://example.com/page#fallback-hash';
      if (scope.document) scope.document.title = 'Fallback Hash';
      // Find and trigger the hashchange event listener
      const hashchangeCall = scope.addEventListener.mock.calls.find(([event]) => event === 'hashchange');
      const hashchangeListener = hashchangeCall?.[1];
      if (hashchangeListener) hashchangeListener();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/page#fallback-hash',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should not add hashchange listener in polling mode', () => {
      const plugin = createUrlTrackingPlugin({ enablePolling: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      // Verify that hashchange event listener was not added in polling mode (polling covers everything)
      const hashchangeCall = mockGlobalScope.addEventListener.mock.calls.find(([event]) => event === 'hashchange');
      expect(hashchangeCall).toBeUndefined();
      cleanup();
    });
  });

  describe('hash routing only mode (scenario 3)', () => {
    test('should handle hash changes when no history API available', () => {
      const scope = createMockGlobalScope({ history: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      mockCallback.mockClear();
      // Simulate URL change
      if (scope.location) scope.location.href = 'https://example.com/page#hash-only';
      if (scope.document) scope.document.title = 'Hash Only';
      // Find and trigger the hashchange event listener
      const hashchangeCall = scope.addEventListener.mock.calls.find(([event]) => event === 'hashchange');
      const hashchangeListener = hashchangeCall?.[1];
      expect(hashchangeListener).toBeDefined();
      if (hashchangeListener) {
        hashchangeListener();
      }
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/page#hash-only',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should emit initial URL in hash routing only mode', () => {
      const scope = createMockGlobalScope({ history: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should emit initial URL even when history API is not available
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should clean up hashchange listener in hash routing only mode', () => {
      const scope = createMockGlobalScope({ history: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      cleanup();
      // Should remove hashchange event listener on cleanup
      expect(scope.removeEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });
  });

  describe('document title capture', () => {
    test('should not capture document title by default', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should capture document title when explicitly enabled', () => {
      const plugin = createUrlTrackingPlugin({ captureDocumentTitle: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: 'Initial Page',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should not capture document title on URL changes by default', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/new-page';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'New Page';
      // Trigger pushState which should be patched by the plugin
      mockGlobalScope.history?.pushState({}, '', '/new-page');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/new-page',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should capture document title on URL changes when explicitly enabled', () => {
      const plugin = createUrlTrackingPlugin({ captureDocumentTitle: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL and title change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/new-page';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'New Page';
      // Trigger pushState which should be patched by the plugin
      mockGlobalScope.history?.pushState({}, '', '/new-page');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/new-page',
        title: 'New Page', // Document title captured when enabled
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
  });

  describe('UGC filtering', () => {
    test('should apply UGC filtering when rules are provided', () => {
      // Mock getPageUrl to return a filtered URL
      (Helpers.getPageUrl as jest.Mock).mockReturnValue('https://example.com/filtered');
      const plugin = createUrlTrackingPlugin({ ugcFilterRules: createMockUgcFilterRules() });
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate navigation to a sensitive URL
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/sensitive';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Sensitive';
      mockGlobalScope.history?.pushState({}, '', '/sensitive');
      // Verify that getPageUrl was called with the filtering rules
      expect(Helpers.getPageUrl).toHaveBeenCalledWith('https://example.com/sensitive', createMockUgcFilterRules());
      // Verify that the filtered URL was emitted
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/filtered',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
    test('should not apply filtering when no rules are provided', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate navigation to a URL
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/no-filtering';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'No Filtering';
      mockGlobalScope.history?.pushState({}, '', '/no-filtering');
      // Verify that getPageUrl was not called (no filtering rules)
      expect(Helpers.getPageUrl).not.toHaveBeenCalled();
      // Verify that the original URL was emitted
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/no-filtering',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
  });

  describe('polling mode (scenario 1)', () => {
    test('should enable polling when explicitly configured', () => {
      const plugin = createUrlTrackingPlugin({ enablePolling: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      // Verify that setInterval was called with the default polling interval
      expect(mockGlobalScope.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
      cleanup();
    });
    test('should use custom polling interval when specified', () => {
      const plugin = createUrlTrackingPlugin({ enablePolling: true, pollingInterval: 2000 });
      const cleanup = callObserver(plugin, mockGlobalScope);
      // Verify that setInterval was called with the custom polling interval
      expect(mockGlobalScope.setInterval).toHaveBeenCalledWith(expect.any(Function), 2000);
      cleanup();
    });
    test('should detect URL changes via polling', () => {
      const plugin = createUrlTrackingPlugin({ enablePolling: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/polled';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Polled';
      // Get the polling function and execute it manually
      const pollingFunction = mockGlobalScope.setInterval.mock.calls[0]?.[0];
      pollingFunction();
      // Verify that the URL change was detected via polling
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/polled',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
    test('should clear polling interval on cleanup', () => {
      const plugin = createUrlTrackingPlugin({ enablePolling: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      cleanup();
      // Verify that the polling interval was cleared
      expect(mockGlobalScope.clearInterval).toHaveBeenCalledWith(123);
    });

    test('should handle null polling interval on cleanup', () => {
      // Mock setInterval to return null
      mockGlobalScope.setInterval.mockReturnValue(null as unknown as number);
      const plugin = createUrlTrackingPlugin({ enablePolling: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      cleanup();
      // Should not call clearInterval when interval is null
      expect(mockGlobalScope.clearInterval).not.toHaveBeenCalled();
    });

    test('should detect URL changes via polling with document title capture enabled', () => {
      const plugin = createUrlTrackingPlugin({ enablePolling: true, captureDocumentTitle: true });
      const cleanup = callObserver(plugin, mockGlobalScope);
      mockCallback.mockClear();
      // Simulate URL change
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/polled';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Polled';
      // Get the polling function and execute it manually
      const pollingFunction = mockGlobalScope.setInterval.mock.calls[0]?.[0];
      pollingFunction();
      // Verify that the URL change was detected via polling with title captured
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/polled',
        title: 'Polled', // Document title captured when enabled
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
  });

  describe('error handling', () => {
    test('should handle missing global scope gracefully', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, undefined);
      // Should not emit any events when global scope is missing
      expect(mockCallback).not.toHaveBeenCalled();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
    test('should handle direct observer call with undefined globalScope', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = plugin.observer?.(jest.fn(), undefined as unknown as IWindow, {});
      // Should return a cleanup function even with undefined global scope
      expect(typeof cleanup).toBe('function');
      if (cleanup) cleanup();
    });

    // PARAMETERIZED: Location edge cases (missing/null/undefined/empty)
    test.each([
      [{ location: undefined }, 'missing location'],
      [{ location: null }, 'null location'],
      [{ location: { href: undefined } }, 'undefined href'],
      [{ location: { href: null as unknown as string } }, 'null href'],
      [{ location: { href: '' } }, 'empty string href'],
    ])('should emit event with empty href for %s', (locationOverride, _label) => {
      const scope = createMockGlobalScope(locationOverride);
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      expect(mockCallback).toHaveBeenCalledWith({
        href: '',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });

    test('should handle missing or null document', () => {
      const testCases = [
        { document: undefined, description: 'undefined document' },
        { document: null, description: 'null document' },
      ];

      testCases.forEach(({ document }) => {
        const scope = createMockGlobalScope({ document });
        const plugin = createUrlTrackingPlugin();
        const cleanup = callObserver(plugin, scope);
        // Should emit event with empty title when document is missing or null
        expect(mockCallback).toHaveBeenCalledWith({
          href: 'https://example.com/initial',
          title: '',
          viewportHeight: 768,
          viewportWidth: 1024,
          type: 'url-change-event',
        });
        cleanup();
        mockCallback.mockClear();
      });
    });
    test('should handle document with undefined title', () => {
      const scope = createMockGlobalScope({ document: { title: undefined } });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should emit event with empty title when document.title is undefined
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
    test('should handle missing history gracefully (falls back to scenario 3)', () => {
      const scope = createMockGlobalScope({ history: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should still emit initial URL even when history is missing (scenario 3: hash routing only)
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: '', // Default behavior: no document title capture
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
  });

  // PARAMETERIZED: Document title edge cases
  describe('document title edge cases', () => {
    test.each([
      [{ document: { title: undefined } }, 'undefined title'],
      [{ document: { title: null as unknown as string } }, 'null title'],
      [{ document: { title: '' } }, 'empty string title'],
      [{ document: undefined }, 'undefined document'],
    ])('should emit empty title for %s when captureDocumentTitle is true', (docOverride, _label) => {
      const scope = createMockGlobalScope(docOverride);
      const plugin = createUrlTrackingPlugin({ captureDocumentTitle: true });
      const cleanup = callObserver(plugin, scope);
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      cleanup();
    });
  });

  // PARAMETERIZED: Consistency across modes
  describe('URL consistency and temporal dead zone fixes', () => {
    test('should handle temporal dead zone correctly - lastTrackedUrl accessible in emitUrlChange', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);

      // This test verifies that lastTrackedUrl is properly accessible
      // The fact that we can call emitUrlChange without ReferenceError proves the fix works
      mockCallback.mockClear();

      // Simulate multiple URL changes to test lastTrackedUrl tracking
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/first';
      mockGlobalScope.history?.pushState({}, '', '/first');

      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/second';
      mockGlobalScope.history?.pushState({}, '', '/second');

      // Should emit both URL changes (no temporal dead zone error)
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenNthCalledWith(1, {
        href: 'https://example.com/first',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });
      expect(mockCallback).toHaveBeenNthCalledWith(2, {
        href: 'https://example.com/second',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });

      cleanup();
    });

    // PARAMETERIZED: Consistency across modes (undefined/null/empty)
    test.each([
      [undefined, 'undefined'],
      [null, 'null'],
      ['', 'empty string'],
    ])('should handle %s location.href consistently across all modes', (hrefValue, _label) => {
      const testCases = [{ options: { enablePolling: true } }, { options: {} }, { options: {}, history: undefined }];
      testCases.forEach(({ options, history }) => {
        const scope = createMockGlobalScope({
          location: { href: hrefValue as string },
          history: history !== undefined ? history : mockGlobalScope.history,
        });
        const plugin = createUrlTrackingPlugin(options);
        const cleanup = callObserver(plugin, scope);
        // Should emit event with empty href consistently across all modes
        expect(mockCallback).toHaveBeenCalledWith({
          href: '',
          title: '',
          viewportHeight: 768,
          viewportWidth: 1024,
          type: 'url-change-event',
        });
        cleanup();
        mockCallback.mockClear();
      });
    });

    test('should handle null location.href consistently across all modes', () => {
      const testCases = [{ options: { enablePolling: true } }, { options: {} }, { options: {}, history: undefined }];

      testCases.forEach(({ options, history }) => {
        const scope = createMockGlobalScope({
          location: { href: null as unknown as string },
          history: history !== undefined ? history : mockGlobalScope.history,
        });
        const plugin = createUrlTrackingPlugin(options);
        const cleanup = callObserver(plugin, scope);

        // Should emit event with empty href consistently across all modes
        expect(mockCallback).toHaveBeenCalledWith({
          href: '',
          title: '',
          viewportHeight: 768,
          viewportWidth: 1024,
          type: 'url-change-event',
        });

        cleanup();
        mockCallback.mockClear();
      });
    });

    test('should handle empty string location.href consistently across all modes', () => {
      const testCases = [{ options: { enablePolling: true } }, { options: {} }, { options: {}, history: undefined }];

      testCases.forEach(({ options, history }) => {
        const scope = createMockGlobalScope({
          location: { href: '' },
          history: history !== undefined ? history : mockGlobalScope.history,
        });
        const plugin = createUrlTrackingPlugin(options);
        const cleanup = callObserver(plugin, scope);

        // Should emit event with empty href consistently across all modes
        expect(mockCallback).toHaveBeenCalledWith({
          href: '',
          title: '',
          viewportHeight: 768,
          viewportWidth: 1024,
          type: 'url-change-event',
        });

        cleanup();
        mockCallback.mockClear();
      });
    });

    test('should prevent duplicate events when location.href transitions between undefined/empty values', () => {
      const scope = createMockGlobalScope({ location: { href: undefined } });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);

      // Initial call should emit empty href
      expect(mockCallback).toHaveBeenCalledWith({
        href: '',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });

      mockCallback.mockClear();

      // Change to empty string - should not emit duplicate
      if (scope.location) scope.location.href = '';
      scope.history?.pushState({}, '', '/');

      // Should not emit duplicate event for same normalized URL
      expect(mockCallback).not.toHaveBeenCalled();

      // Change to actual URL - should emit
      if (scope.location) scope.location.href = 'https://example.com/actual';
      scope.history?.pushState({}, '', '/actual');

      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/actual',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });

      cleanup();
    });

    test('should handle getCurrentUrl function behavior correctly', () => {
      const testCases = [
        { href: undefined, expected: '' },
        { href: null, expected: '' },
        { href: '', expected: '' },
        { href: 'https://example.com/test', expected: 'https://example.com/test' },
      ];

      testCases.forEach(({ href, expected }) => {
        const scope = createMockGlobalScope({ location: { href: href as string } });
        const plugin = createUrlTrackingPlugin();
        const cleanup = callObserver(plugin, scope);

        // Should emit event with expected href
        expect(mockCallback).toHaveBeenCalledWith({
          href: expected,
          title: '',
          viewportHeight: 768,
          viewportWidth: 1024,
          type: 'url-change-event',
        });

        cleanup();
        mockCallback.mockClear();
      });
    });
  });

  describe('shared subscription (subscribeToUrlChanges)', () => {
    test('multiple plugin instances share a single history patch', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup1 = callObserver(plugin, mockGlobalScope);
      const patchedPushState = mockGlobalScope.history?.pushState;
      const patchedReplaceState = mockGlobalScope.history?.replaceState;

      const cleanup2 = callObserver(plugin, mockGlobalScope);
      expect(mockGlobalScope.history?.pushState).toBe(patchedPushState);
      expect(mockGlobalScope.history?.replaceState).toBe(patchedReplaceState);

      cleanup1();
      cleanup2();
    });

    test('multiple plugin instances each receive URL change and share one patch', () => {
      const scope = createMockGlobalScope() as unknown as MockGlobalScope;
      const plugin1 = createUrlTrackingPlugin();
      const plugin2 = createUrlTrackingPlugin();
      const plugin3 = createUrlTrackingPlugin();
      const cleanup1 = callObserver(plugin1, scope);
      const cleanup2 = callObserver(plugin2, scope);
      const cleanup3 = callObserver(plugin3, scope);

      expect(scope.history?.pushState).toBeDefined();
      mockCallback.mockClear();
      // Trigger via popstate listener (subscription notifies all callbacks with current location.href)
      if (scope.location) scope.location.href = 'https://example.com/multi-instance';
      const popstateCalls = (scope.addEventListener as jest.Mock).mock.calls.filter(
        (c: [string]) => c[0] === 'popstate',
      );
      const popstateListener = popstateCalls[0]?.[1];
      expect(popstateListener).toBeDefined();
      popstateListener?.();

      expect(mockCallback).toHaveBeenCalledTimes(3);
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/multi-instance',
        title: '',
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });

      cleanup1();
      cleanup2();
      cleanup3();
    });

    test('when plugin is the only subscriber, cleanup removes listeners but does not restore history', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);
      const patchedPushState = mockGlobalScope.history?.pushState;
      const patchedReplaceState = mockGlobalScope.history?.replaceState;

      cleanup();

      // We do not restore history (other scripts may have patched); patch remains
      expect(mockGlobalScope.history?.pushState).toBe(patchedPushState);
      expect(mockGlobalScope.history?.replaceState).toBe(patchedReplaceState);
      expect(mockGlobalScope.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
      expect(mockGlobalScope.removeEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });

    test('when another subscriber exists, plugin cleanup leaves patch and listeners in place', () => {
      const cb = jest.fn();
      const unsubscribeTargeting = subscribeToUrlChanges(mockGlobalScope as unknown as Window, cb);
      const plugin = createUrlTrackingPlugin();
      const cleanupPlugin = callObserver(plugin, mockGlobalScope);
      const patchedPushState = mockGlobalScope.history?.pushState;

      cleanupPlugin();

      expect(mockGlobalScope.history?.pushState).toBe(patchedPushState);
      cb.mockClear();
      if (mockGlobalScope.history?.pushState) {
        mockGlobalScope.history.pushState({}, '', 'https://example.com/after-plugin-cleanup');
      }
      expect(cb).toHaveBeenCalledWith('https://example.com/after-plugin-cleanup');
      unsubscribeTargeting();
    });

    test('should work correctly with different plugin options', () => {
      const plugin1 = createUrlTrackingPlugin({ captureDocumentTitle: true });
      const plugin2 = createUrlTrackingPlugin({ captureDocumentTitle: false });

      const cleanup1 = callObserver(plugin1, mockGlobalScope);

      // Store first patched methods
      const firstPatchedPushState = mockGlobalScope.history?.pushState;

      const cleanup2 = callObserver(plugin2, mockGlobalScope);

      // Second plugin should detect existing patch and skip
      expect(mockGlobalScope.history?.pushState).toBe(firstPatchedPushState);

      // Test that functionality still works
      mockCallback.mockClear();
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/options-test';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'Options Test';
      mockGlobalScope.history?.pushState({}, '', '/options-test');

      // Should emit event (from the first plugin's configuration)
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/options-test',
        title: 'Options Test', // First plugin had captureDocumentTitle: true
        viewportHeight: 768,
        viewportWidth: 1024,
        type: 'url-change-event',
      });

      cleanup1();
      cleanup2();
    });
  });
});
