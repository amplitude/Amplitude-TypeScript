import { createUrlTrackingPlugin, URLTrackingPluginOptions } from '../src/plugins/url-tracking-plugin';
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
      hashchangeListener!();
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
      hashchangeListener!();
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
});
