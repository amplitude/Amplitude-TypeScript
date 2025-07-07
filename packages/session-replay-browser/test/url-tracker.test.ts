import { URLTracker, URLChangeCallback } from '../src/observers/url-tracker';
import * as AnalyticsCore from '@amplitude/analytics-core';
import * as Helpers from '../src/helpers';

jest.mock('../src/helpers', () => ({
  getPageUrl: jest.fn(),
}));

// Create proper mock types for testing
interface MockGlobalScope {
  history: {
    pushState: jest.Mock;
    replaceState: jest.Mock;
  };
  location: {
    href: string;
  };
  document: {
    title: string | undefined;
  };
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  setInterval: jest.Mock;
  clearInterval: jest.Mock;
}

// Test data factories
const createMockUgcFilterRules = () => [
  { selector: 'test', replacement: 'filtered' },
  { selector: '/test/', replacement: 'filtered' },
];

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
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  setInterval: jest.fn().mockReturnValue(123),
  clearInterval: jest.fn(),
  ...overrides,
});

describe('URLTracker', () => {
  let urlTracker: URLTracker;
  let mockCallback: jest.MockedFunction<URLChangeCallback>;
  let mockGlobalScope: MockGlobalScope;

  // Test helpers
  const setUrlAndTitle = (url: string, title: string | undefined = undefined) => {
    mockGlobalScope.location.href = url;
    mockGlobalScope.document.title = title ?? title;
  };

  const startTrackingAndClearCallback = () => {
    urlTracker.start(mockCallback);
    mockCallback.mockClear();
  };

  const mockGlobalScopeReturn = (scope: MockGlobalScope | undefined) => {
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope as unknown as typeof globalThis);
  };

  const getPopstateListener = () => {
    const addEventListenerCalls = mockGlobalScope.addEventListener.mock.calls as unknown[][];
    const popstateCall = addEventListenerCalls.find((call) => call[0] === 'popstate');
    return popstateCall?.[1] as () => void;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockCallback = jest.fn();
    mockGlobalScope = createMockGlobalScope();

    mockGlobalScopeReturn(mockGlobalScope);
    (Helpers.getPageUrl as jest.Mock).mockImplementation((url: string) => url);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (Helpers.getPageUrl as jest.Mock).mockClear();
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      urlTracker = new URLTracker();
      expect(urlTracker).toBeDefined();
    });

    test('should initialize with custom options', () => {
      urlTracker = new URLTracker({
        ugcFilterRules: createMockUgcFilterRules(),
        enablePolling: true,
      });
      expect(urlTracker).toBeDefined();
    });
  });

  describe('start and stop', () => {
    beforeEach(() => {
      urlTracker = new URLTracker();
    });

    test('should start tracking and emit initial URL', () => {
      urlTracker.start(mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/initial',
        title: 'Initial Page',
      });
    });

    test('should not start if already tracking', () => {
      startTrackingAndClearCallback();
      urlTracker.start(mockCallback);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should stop tracking', () => {
      urlTracker.start(mockCallback);
      urlTracker.stop();
      expect(mockGlobalScope.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    test('should handle missing global scope gracefully', () => {
      // Test start with undefined global scope
      mockGlobalScopeReturn(undefined);
      expect(() => urlTracker.start(mockCallback)).not.toThrow();

      // Test teardown with undefined global scope
      mockGlobalScopeReturn(mockGlobalScope);
      urlTracker.start(mockCallback);
      mockGlobalScopeReturn(undefined);
      expect(() => urlTracker.stop()).not.toThrow();
    });

    test('should not stop if not tracking', () => {
      expect(() => urlTracker.stop()).not.toThrow();
      expect(mockGlobalScope.removeEventListener).not.toHaveBeenCalled();
    });
  });

  describe('URL change detection', () => {
    beforeEach(() => {
      urlTracker = new URLTracker();
      startTrackingAndClearCallback();
    });

    test('should detect URL changes via pushState', () => {
      setUrlAndTitle('https://example.com/new-page', 'New Page');
      mockGlobalScope.history.pushState({}, '', '/new-page');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/new-page',
        title: 'New Page',
      });
    });

    test('should detect URL changes via replaceState', () => {
      setUrlAndTitle('https://example.com/replaced-page', 'Replaced Page');
      mockGlobalScope.history.replaceState({}, '', '/replaced-page');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/replaced-page',
        title: 'Replaced Page',
      });
    });

    test('should detect URL changes via popstate', () => {
      setUrlAndTitle('https://example.com/back-page', 'Back Page');
      const popstateListener = getPopstateListener();
      popstateListener();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/back-page',
        title: 'Back Page',
      });
    });

    test('should not emit duplicate URL changes', () => {
      setUrlAndTitle('https://example.com/initial', 'Initial Page');
      mockGlobalScope.history.pushState({}, '', '/initial');
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('UGC filtering', () => {
    test('should apply UGC filtering when rules exist', () => {
      const mockUgcFilterRules = [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }];
      urlTracker = new URLTracker({ ugcFilterRules: mockUgcFilterRules });

      const filteredUrl = 'https://example.com/filtered';
      (Helpers.getPageUrl as jest.Mock).mockReturnValue(filteredUrl);

      startTrackingAndClearCallback();
      setUrlAndTitle('https://example.com/sensitive', 'Sensitive Page');
      mockGlobalScope.history.pushState({}, '', '/sensitive');

      expect(Helpers.getPageUrl).toHaveBeenCalledWith('https://example.com/sensitive', mockUgcFilterRules);
      expect(mockCallback).toHaveBeenCalledWith({
        href: filteredUrl,
        title: 'Sensitive Page',
      });
    });

    test('should not apply UGC filtering when no rules exist', () => {
      urlTracker = new URLTracker({ ugcFilterRules: [] });
      startTrackingAndClearCallback();
      setUrlAndTitle('https://example.com/no-filtering', 'No Filtering');
      mockGlobalScope.history.pushState({}, '', '/no-filtering');

      expect(Helpers.getPageUrl).not.toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/no-filtering',
        title: 'No Filtering',
      });
    });
  });

  describe('polling', () => {
    test('should setup polling when enabled', () => {
      urlTracker = new URLTracker({ enablePolling: true });
      urlTracker.start(mockCallback);
      expect(mockGlobalScope.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    test('should not setup polling when disabled', () => {
      urlTracker = new URLTracker({ enablePolling: false });
      urlTracker.start(mockCallback);
      expect(mockGlobalScope.setInterval).not.toHaveBeenCalled();
    });

    test('should clear polling interval when stopped', () => {
      urlTracker = new URLTracker({ enablePolling: true });
      urlTracker.start(mockCallback);
      urlTracker.stop();
      expect(mockGlobalScope.clearInterval).toHaveBeenCalledWith(123);
    });

    test('should execute polling callback and emit URL changes', () => {
      let intervalCallback: (() => void) | null = null;
      mockGlobalScope.setInterval = jest.fn().mockImplementation((callback: () => void) => {
        intervalCallback = callback;
        return 123;
      });

      urlTracker = new URLTracker({ enablePolling: true });
      startTrackingAndClearCallback();
      setUrlAndTitle('https://example.com/polled-page', 'Polled Page');

      expect(intervalCallback).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      intervalCallback!();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/polled-page',
        title: 'Polled Page',
      });
    });
  });

  describe('updateConfig', () => {
    test('should update UGC filter rules', () => {
      urlTracker = new URLTracker();
      const newRules = [{ selector: 'updated', replacement: 'filtered' }];
      urlTracker.updateConfig(newRules);

      const filteredUrl = 'https://example.com/filtered';
      (Helpers.getPageUrl as jest.Mock).mockReturnValue(filteredUrl);

      startTrackingAndClearCallback();
      setUrlAndTitle('https://example.com/updated', 'Updated Page');
      mockGlobalScope.history.pushState({}, '', '/updated');

      expect(Helpers.getPageUrl).toHaveBeenCalledWith('https://example.com/updated', newRules);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      urlTracker = new URLTracker();
    });

    test('should handle missing document title', () => {
      startTrackingAndClearCallback();
      setUrlAndTitle('https://example.com/no-title', undefined);
      mockGlobalScope.history.pushState({}, '', '/no-title');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/no-title',
        title: '',
      });
    });

    test('should handle undefined global scope in emitUrlChange', () => {
      urlTracker.start(mockCallback);
      mockCallback.mockClear();
      mockGlobalScopeReturn(undefined);

      expect(() => {
        // @ts-expect-error - Testing private method
        urlTracker.emitUrlChange();
      }).not.toThrow();
      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should handle missing location in global scope', () => {
      const scopeWithoutLocation = {
        ...createMockGlobalScope(),
        location: undefined,
      };
      // @ts-expect-error - Testing edge case with invalid scope type
      mockGlobalScopeReturn(scopeWithoutLocation);

      urlTracker.start(mockCallback);
      mockCallback.mockClear();

      // @ts-expect-error - Testing private method
      urlTracker.emitUrlChange();
      scopeWithoutLocation.history.pushState({}, '', '/test');
      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should handle emitUrlChange called without callback', () => {
      urlTracker.start(mockCallback);
      urlTracker.stop(); // This clears the callback
      mockCallback.mockClear();

      expect(() => {
        // @ts-expect-error - Testing private method
        urlTracker.emitUrlChange();
      }).not.toThrow();
      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should handle undefined document in global scope', () => {
      const scopeWithNoDocument = {
        ...createMockGlobalScope(),
        document: undefined,
      };
      // @ts-expect-error - Testing edge case with invalid scope type
      mockGlobalScopeReturn(scopeWithNoDocument);

      urlTracker.start(mockCallback);
      mockCallback.mockClear();

      scopeWithNoDocument.location.href = 'https://example.com/test';
      scopeWithNoDocument.history.pushState({}, '', '/test');
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/test',
        title: '',
      });
    });

    test('should handle undefined original methods in patches', () => {
      urlTracker.start(mockCallback);
      mockCallback.mockClear();

      // Test undefined originalPushState
      // @ts-expect-error - Testing private property
      urlTracker.originalPushState = undefined;
      setUrlAndTitle('https://example.com/test-push', 'Initial Page');

      expect(() => {
        mockGlobalScope.history.pushState({}, '', '/test-push');
      }).not.toThrow();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/test-push',
        title: 'Initial Page',
      });

      mockCallback.mockClear();

      // Test undefined originalReplaceState
      // @ts-expect-error - Testing private property
      urlTracker.originalReplaceState = undefined;
      setUrlAndTitle('https://example.com/test-replace', 'Initial Page');

      expect(() => {
        mockGlobalScope.history.replaceState({}, '', '/test-replace');
      }).not.toThrow();
      expect(mockCallback).toHaveBeenCalledWith({
        href: 'https://example.com/test-replace',
        title: 'Initial Page',
      });
    });
  });
});
