import { NetworkEventCallback, NetworkRequestEvent, networkObserver } from '../src/index';
import { NetworkObserver } from '../src/network-observer';
import * as AnalyticsCore from '@amplitude/analytics-core';
import { TextEncoder } from 'util';
import * as streams from 'stream/web';
import * as Global from '../src/global-scope';
type PartialGlobal = Pick<typeof globalThis, 'fetch'>;

// Test subclass to access protected methods
class TestNetworkObserver extends NetworkObserver {
  public testNotifyEvent(event: NetworkRequestEvent) {
    this.triggerEventCallbacks(event);
  }
}

describe('NetworkObserver', () => {
  let networkObserver: TestNetworkObserver;
  let originalFetchMock: jest.Mock;
  let events: NetworkRequestEvent[] = [];
  let globalScope: PartialGlobal;

  beforeEach(() => {
    jest.useFakeTimers();
    events = [];
    originalFetchMock = jest.fn();
    globalScope = {
      fetch: originalFetchMock,
      TextEncoder,
      ReadableStream: streams.ReadableStream,
    } as PartialGlobal;

    jest.spyOn(Global, 'getGlobalScope').mockReturnValue(globalScope as typeof globalThis);

    networkObserver = new TestNetworkObserver();
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
      const headers = new Headers();
      headers.set('content-type', 'application/json');
      headers.set('content-length', '20');
      headers.set('server', 'test-server');
      const mockResponse = {
        status: 200,
        headers,
      };
      originalFetchMock.mockResolvedValue(mockResponse);

      networkObserver.subscribe(new NetworkEventCallback(callback));

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
        responseHeaders: headers,
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should track successful fetch requests with headers (uses Headers object)', async () => {
      // Create a simple mock response
      const headers = new Headers();
      headers.set('content-type', 'application/json');
      headers.set('content-length', '20');
      headers.set('server', 'test-server');
      const mockResponse = {
        status: 200,
        headers,
      };
      originalFetchMock.mockResolvedValue(mockResponse);

      networkObserver.subscribe(new NetworkEventCallback(callback));

      const requestHeaders = new Headers();
      requestHeaders.set('Content-Type', 'application/json');
      requestHeaders.set('Authorization', 'Bearer token123');

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
        responseHeaders: headers,
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
      originalFetchMock.mockResolvedValue(mockResponse);

      networkObserver.subscribe(new NetworkEventCallback(callback));

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

    it('should ignore ReadableStream in requestBody', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          forEach: jest.fn(), // Mock function that does nothing
        },
      };
      originalFetchMock.mockResolvedValue(mockResponse);
      networkObserver.subscribe(new NetworkEventCallback(callback));
      const requestBody = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello, world!');
          controller.close();
        },
      });
      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: requestBody,
      });
      expect(events[0].requestBody).toBeUndefined();
    });

    it('should still fetch even if eventCallback throws error', async () => {
      const headers = new Headers();
      headers.set('content-type', 'application/json');
      headers.set('content-length', '20');
      const mockResponse = {
        status: 200,
        headers,
      };
      originalFetchMock.mockResolvedValue(mockResponse);
      const errorCallback = (event: NetworkRequestEvent) => {
        expect(event.status).toBe(200);
        throw new Error('Error in event callback');
      };
      networkObserver.subscribe(new NetworkEventCallback(errorCallback));
      const res = await globalScope.fetch('https://api.example.com/data');
      expect(res.status).toBe(200);
    });
  });

  describe('failed requests', () => {
    it('should track network errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      originalFetchMock.mockRejectedValue(networkError);

      networkObserver.subscribe(new NetworkEventCallback(callback));

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

    it('should track aborted requests', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      originalFetchMock.mockRejectedValue(abortError);
      networkObserver.subscribe(new NetworkEventCallback(callback));
      const controller = new AbortController();
      const signal = controller.signal;
      controller.abort();
      await expect(globalScope.fetch('https://api.example.com/data', { signal })).rejects.toThrow('Aborted');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'fetch',
        method: 'GET',
        url: 'https://api.example.com/data',
        error: {
          name: 'AbortError',
          message: 'Aborted',
        },
      });
      expect(events[0].status).toBe(0);
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-Error throws', async () => {
      originalFetchMock.mockRejectedValue('string error');
      const cb = new NetworkEventCallback(callback);
      networkObserver.subscribe(cb);

      await expect(globalScope.fetch('https://api.example.com/data')).rejects.toBe('string error');

      expect(events).toHaveLength(1);
      expect(events[0].error).toEqual({
        name: 'UnknownError',
        message: 'An unknown error occurred',
      });
    });
  });

  describe('fetch calls with junk data', () => {
    it('should pass junk data to originalfetch', async () => {
      const mockResponse = {
        status: 500,
        headers: {
          forEach: jest.fn(), // Mock function that does nothing
        },
      };
      originalFetchMock.mockResolvedValue(mockResponse);
      networkObserver.subscribe(new NetworkEventCallback(callback));
      expect(globalScope.fetch).not.toBe(originalFetchMock);

      const fetchJunkArgs = [
        [12345 as any, undefined],
        [null, null],
        [[1, 2, 3], { a: 1 }],
        [true, [1, 2, 3]],
        [undefined, undefined],
        ['two', 'args'],
        [undefined, { method: 'POST' }],
      ];

      // checks that the original fetch is called with the same junk data
      for (const args of fetchJunkArgs) {
        /* eslint-disable @typescript-eslint/no-unsafe-argument */
        const res = await globalScope.fetch(...(args as [any, any]));
        expect(originalFetchMock).toHaveBeenCalledWith(...args);
        expect(res).toEqual(mockResponse);
        /* eslint-enable @typescript-eslint/no-unsafe-argument */
      }
    });
  });

  describe('observer lifecycle', () => {
    it('should throw an exception if fetch is not supported', async () => {
      // Mock the global scope to not have fetch
      const scopeWithoutFetch = {} as typeof globalThis;
      jest.spyOn(Global, 'getGlobalScope').mockReturnValue(scopeWithoutFetch);
      const localLogger = {
        error: jest.fn(),
        disable: jest.fn(),
        enable: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
      };
      new NetworkObserver(localLogger);
    });

    it('should only restore globalScope.fetch when all subscriptions are unsubscribed', async () => {
      const cb1 = new NetworkEventCallback(callback);
      const cb2 = new NetworkEventCallback(callback);
      networkObserver.subscribe(cb1);
      networkObserver.subscribe(cb2);
      networkObserver.unsubscribe(cb1);

      // cb1 unsubscribed, but cb2 is still subscribed so fetch should be overridden
      expect(globalScope.fetch).not.toBe(originalFetchMock);

      // cb1 and cb2 unsubscribed, fetch should be restored
      networkObserver.unsubscribe(cb2);
      expect(globalScope.fetch).toBe(originalFetchMock);
    });

    it('should stop tracking when no event subscriptions are left', async () => {
      const cb = new NetworkEventCallback(callback);
      networkObserver.subscribe(cb);
      networkObserver.unsubscribe(cb);

      expect(globalScope.fetch).toBe(originalFetchMock);

      await originalFetchMock('https://api.example.com/data');
      expect(events).toHaveLength(0);
    });

    it('should handle missing global scope', () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);
      const cb = new NetworkEventCallback(callback);
      networkObserver.subscribe(cb);

      expect(() => networkObserver.unsubscribe(cb)).not.toThrow();
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
      originalFetchMock.mockResolvedValue(mockResponse);
      const cb = new NetworkEventCallback(mockCallback);
      networkObserver.subscribe(cb);

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
      const cb = new NetworkEventCallback(mockCallback);
      networkObserver.subscribe(cb);
      networkObserver.testNotifyEvent(mockEvent);
      expect(mockCallback).toHaveBeenCalledWith(mockEvent);

      // Test without callback
      networkObserver.unsubscribe(cb);
      networkObserver.testNotifyEvent(mockEvent);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still only called once
    });
  });
});

describe('networkObserver', () => {
  test('should be an instance of NetworkObserver', () => {
    expect(networkObserver).toBeInstanceOf(NetworkObserver);
  });
});
