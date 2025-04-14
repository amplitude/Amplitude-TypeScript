import { NetworkObservers, NetworkRequestEvent } from '../src/observers';
import * as AnalyticsCore from '@amplitude/analytics-core';
type PartialGlobal = Pick<typeof globalThis, 'fetch'>;

// Test subclass to access protected methods
class TestNetworkObservers extends NetworkObservers {
  public testNotifyEvent(event: NetworkRequestEvent) {
    this.notifyEvent(event);
  }
}

describe('NetworkObservers', () => {
  let networkObservers: TestNetworkObservers;
  let mockFetch: jest.Mock;
  let events: NetworkRequestEvent[] = [];
  let globalScope: PartialGlobal;

  beforeEach(() => {
    jest.useFakeTimers();
    events = [];
    mockFetch = jest.fn();
    globalScope = { fetch: mockFetch };

    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(globalScope as typeof globalThis);

    networkObservers = new TestNetworkObservers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const callback = (event: NetworkRequestEvent) => {
    events.push(event);
  };

  describe('successful requests', () => {
    it('should track successful fetch requests with headers', async () => {
      // Create a simple mock response
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (callback: (value: string, key: string) => void) => {
            callback('application/json', 'content-type');
            callback('test-server', 'server');
          },
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      networkObservers.start(callback);

      const requestHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      };

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        headers: requestHeaders,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'fetch',
        method: 'POST',
        url: 'https://api.example.com/data',
        status: 200,
        requestHeaders,
        responseHeaders: {
          'content-type': 'application/json',
          server: 'test-server',
        },
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should track successful fetch requests without headers', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          forEach: jest.fn(), // Mock function that does nothing
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      networkObservers.start(callback);

      await globalScope.fetch('https://api.example.com/data');

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'fetch',
        method: 'GET',
        url: 'https://api.example.com/data',
        status: 200,
        requestHeaders: undefined,
        responseHeaders: {},
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('failed requests', () => {
    it('should track network errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValue(networkError);

      networkObservers.start(callback);

      await expect(globalScope.fetch('https://api.example.com/data')).rejects.toThrow('Failed to fetch');

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'fetch',
        method: 'GET',
        url: 'https://api.example.com/data',
        error: {
          name: 'TypeError',
          message: 'Failed to fetch',
        },
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-Error throws', async () => {
      mockFetch.mockRejectedValue('string error');

      networkObservers.start(callback);

      await expect(globalScope.fetch('https://api.example.com/data')).rejects.toBe('string error');

      expect(events).toHaveLength(1);
      expect(events[0].error).toEqual({
        name: 'UnknownError',
        message: 'An unknown error occurred',
      });
    });
  });

  describe('observer lifecycle', () => {
    it('should stop tracking when stopped', async () => {
      networkObservers.start(callback);
      networkObservers.stop();

      expect(globalScope.fetch).toBe(mockFetch);

      await mockFetch('https://api.example.com/data');
      expect(events).toHaveLength(0);
    });

    it('should handle missing global scope', () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);

      networkObservers.start(callback);

      expect(() => networkObservers.stop()).not.toThrow();
    });

    it('should handle missing fetch', () => {
      const scopeWithoutFetch = {} as typeof globalThis;
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scopeWithoutFetch);

      networkObservers.start(callback);

      expect(() => networkObservers.stop()).not.toThrow();
    });

    it('should call eventCallback with request event data', async () => {
      const mockCallback = jest.fn();
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (callback: (value: string, key: string) => void) => {
            callback('application/json', 'content-type');
          },
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      networkObservers.start(mockCallback);

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle notifyEvent with optional chaining', async () => {
      const mockEvent = {
        timestamp: Date.now(),
        type: 'fetch' as const,
        method: 'GET',
        url: 'https://api.example.com/data',
      };

      // Test with callback
      const mockCallback = jest.fn();
      networkObservers.start(mockCallback);
      networkObservers.testNotifyEvent(mockEvent);
      expect(mockCallback).toHaveBeenCalledWith(mockEvent);

      // Test without callback
      networkObservers.stop();
      networkObservers.testNotifyEvent(mockEvent);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still only called once
    });
  });
});
