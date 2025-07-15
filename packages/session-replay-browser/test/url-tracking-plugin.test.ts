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
        title: 'Initial Page',
        viewportHeight: 768,
        viewportWidth: 1024,
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

  describe('URL change detection', () => {
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
        title: 'New Page',
        viewportHeight: 768,
        viewportWidth: 1024,
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
        title: 'Replaced Page',
        viewportHeight: 768,
        viewportWidth: 1024,
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
        title: 'Back Page',
        viewportHeight: 768,
        viewportWidth: 1024,
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
        title: 'Viewport Test',
        viewportHeight: 600,
        viewportWidth: 800,
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
        title: 'Sensitive',
        viewportHeight: 768,
        viewportWidth: 1024,
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
        title: 'No Filtering',
        viewportHeight: 768,
        viewportWidth: 1024,
      });
      cleanup();
    });
  });

  describe('polling', () => {
    test('should enable polling when configured', () => {
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
        title: 'Polled',
        viewportHeight: 768,
        viewportWidth: 1024,
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
    test('should handle missing location gracefully', () => {
      const scope = createMockGlobalScope({ location: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should not emit events when location is missing
      expect(mockCallback).not.toHaveBeenCalled();
      cleanup();
    });
    test('should handle null location gracefully', () => {
      const scope = createMockGlobalScope({ location: null });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should not emit events when location is null
      expect(mockCallback).not.toHaveBeenCalled();
      cleanup();
    });
    test('should handle location with undefined href', () => {
      const scope = createMockGlobalScope({ location: { href: undefined } });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should emit event with empty href when location.href is undefined
      expect(mockCallback).toHaveBeenCalledWith({
        href: '',
        title: 'Initial Page',
        viewportHeight: 768,
        viewportWidth: 1024,
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
      });
      cleanup();
    });
    test('should handle missing history gracefully', () => {
      const scope = createMockGlobalScope({ history: undefined });
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, scope);
      // Should still emit initial URL even when history is missing
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: 'Initial Page',
        viewportHeight: 768,
        viewportWidth: 1024,
      });
      cleanup();
    });
  });

  describe('history method patching', () => {
    test('should restore original history methods on cleanup', () => {
      const originalPushState = jest.fn();
      const originalReplaceState = jest.fn();

      // Set up the mock to track the bound methods
      if (mockGlobalScope.history) {
        mockGlobalScope.history.pushState = originalPushState;
        mockGlobalScope.history.replaceState = originalReplaceState;
      }

      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);

      // History methods should be patched
      expect(mockGlobalScope.history?.pushState).not.toBe(originalPushState);
      expect(mockGlobalScope.history?.replaceState).not.toBe(originalReplaceState);

      cleanup();

      // History methods should be restored and functional
      expect(typeof mockGlobalScope.history?.pushState).toBe('function');
      expect(typeof mockGlobalScope.history?.replaceState).toBe('function');

      // Test that the restored methods still work
      mockGlobalScope.history?.pushState({}, '', '/test');
      mockGlobalScope.history?.replaceState({}, '', '/test');

      expect(originalPushState).toHaveBeenCalledWith({}, '', '/test');
      expect(originalReplaceState).toHaveBeenCalledWith({}, '', '/test');
    });

    test('should call original history methods', () => {
      const originalPushState = jest.fn();
      if (mockGlobalScope.history) {
        mockGlobalScope.history.pushState = originalPushState;
      }

      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);

      mockCallback.mockClear();

      const state = { foo: 'bar' };
      const title = 'Test';
      const url = '/test';

      // Call the patched method
      mockGlobalScope.history?.pushState(state, title, url);

      // The original method should have been called
      expect(originalPushState).toHaveBeenCalledWith(state, title, url);

      cleanup();
    });
  });

  describe('cleanup', () => {
    test('should remove event listeners on cleanup', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);

      cleanup();

      expect(mockGlobalScope.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    test('should reset internal state on cleanup', () => {
      const plugin = createUrlTrackingPlugin();
      const cleanup = callObserver(plugin, mockGlobalScope);

      mockCallback.mockClear();

      // Change URL and cleanup
      if (mockGlobalScope.location) mockGlobalScope.location.href = 'https://example.com/new';
      if (mockGlobalScope.document) mockGlobalScope.document.title = 'New';
      mockGlobalScope.history?.pushState({}, '', '/new');
      cleanup();

      mockCallback.mockClear();

      // Start new observer should emit initial URL again
      const cleanup2 = callObserver(plugin, mockGlobalScope);

      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/new',
        title: 'New',
        viewportHeight: 768,
        viewportWidth: 1024,
      });

      cleanup2();
    });
  });
});
