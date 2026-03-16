import { NetworkObservers, NetworkRequestEvent, NetworkConfig } from '../src/observers';
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

  describe('request body capture', () => {
    const networkConfig: NetworkConfig = { enabled: true, body: { request: true } };

    it('should capture string request body', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: '{"key":"value"}',
      });

      expect(events[0].requestBody).toBe('{"key":"value"}');
    });

    it('should capture URLSearchParams request body', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: new URLSearchParams({ foo: 'bar', baz: 'qux' }),
      });

      expect(events[0].requestBody).toBe('foo=bar&baz=qux');
    });

    it('should capture FormData request body', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      const formData = new FormData();
      formData.append('username', 'alice');
      formData.append('password', 'secret');

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: formData,
      });

      expect(events[0].requestBody).toBe('username=alice&password=secret');
    });

    it('should skip binary request body types', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: new ArrayBuffer(8),
      });

      expect(events[0].requestBody).toBeUndefined();
    });

    it('should truncate request body exceeding maxBodySizeBytes', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { request: true, maxBodySizeBytes: 5 } });

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: 'hello world',
      });

      expect(events[0].requestBody).toBe('hello');
    });

    it('should truncate request body at a character boundary for multi-byte content', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      // 🎉 is 4 UTF-8 bytes; with maxBodySizeBytes: 4, only the emoji should be kept
      networkObservers.start(callback, { enabled: true, body: { request: true, maxBodySizeBytes: 4 } });

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: '🎉hello',
      });

      expect(events[0].requestBody).toBe('🎉');
    });

    it('should not produce a broken surrogate pair when truncation boundary falls mid-emoji', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      // 'a' (1 byte) + '🎉' (4 bytes) = 5 bytes; limit of 4 means binary search would land
      // after the high surrogate of 🎉 (giving 1+3=4 bytes) without the surrogate fix.
      networkObservers.start(callback, { enabled: true, body: { request: true, maxBodySizeBytes: 4 } });

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: 'a🎉',
      });

      expect(events[0].requestBody).toBe('a');
    });

    it('should not capture request body when body.request is false', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { request: false } });

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: '{"key":"value"}',
      });

      expect(events[0].requestBody).toBeUndefined();
    });

    it('should not capture request body when body config is absent', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback);

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: '{"key":"value"}',
      });

      expect(events[0].requestBody).toBeUndefined();
    });

    it('should handle undefined init when request body capture is enabled', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      await globalScope.fetch('https://api.example.com/data');

      expect(events[0].requestBody).toBeUndefined();
    });

    it('should handle null body when request body capture is enabled', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      await globalScope.fetch('https://api.example.com/data', { method: 'POST', body: null });

      expect(events[0].requestBody).toBeUndefined();
    });

    it('should represent File entries in FormData as [File]', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, networkConfig);

      const formData = new FormData();
      formData.append('name', 'alice');
      formData.append('avatar', new File(['content'], 'avatar.png'));

      await globalScope.fetch('https://api.example.com/data', { method: 'POST', body: formData });

      expect(events[0].requestBody).toBe('name=alice&avatar=[File]');
    });
  });

  describe('response body capture', () => {
    it('should capture response body with status "captured"', async () => {
      const mockClone = { text: jest.fn().mockResolvedValue('{"result":"ok"}') };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('application/json', 'content-type');
          },
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true } });

      await globalScope.fetch('https://api.example.com/data');

      // Wait for the detached body-read promise to resolve
      await Promise.resolve();

      expect(events[0].responseBody).toBe('{"result":"ok"}');
      expect(events[0].responseBodyStatus).toBe('captured');
    });

    it('should truncate response body exceeding maxBodySizeBytes', async () => {
      const mockClone = { text: jest.fn().mockResolvedValue('hello world') };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('text/plain', 'content-type');
          },
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true, maxBodySizeBytes: 5 } });

      await globalScope.fetch('https://api.example.com/data');
      await Promise.resolve();

      expect(events[0].responseBody).toBe('hello');
      expect(events[0].responseBodyStatus).toBe('truncated');
    });

    it('should not produce a broken surrogate pair when truncation boundary falls mid-emoji', async () => {
      // 'a' (1 byte) + '🎉' (4 bytes) = 5 bytes; limit of 4 means binary search would land
      // after the high surrogate of 🎉 (giving 1+3=4 bytes) without the surrogate fix.
      const mockClone = { text: jest.fn().mockResolvedValue('a🎉') };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('text/plain', 'content-type');
          },
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true, maxBodySizeBytes: 4 } });

      await globalScope.fetch('https://api.example.com/data');
      await Promise.resolve();

      expect(events[0].responseBody).toBe('a');
      expect(events[0].responseBodyStatus).toBe('truncated');
    });

    it('should truncate response body at a character boundary for multi-byte content', async () => {
      // 🎉 is 4 UTF-8 bytes; with maxBodySizeBytes: 4, only the emoji should be kept
      const mockClone = { text: jest.fn().mockResolvedValue('🎉hello') };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('text/plain', 'content-type');
          },
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true, maxBodySizeBytes: 4 } });

      await globalScope.fetch('https://api.example.com/data');
      await Promise.resolve();

      expect(events[0].responseBody).toBe('🎉');
      expect(events[0].responseBodyStatus).toBe('truncated');
    });

    it('should set responseBodyStatus to "skipped_binary" for binary content types', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('image/png', 'content-type');
          },
        },
        clone: jest.fn(),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true } });

      await globalScope.fetch('https://api.example.com/image.png');

      expect(events[0].responseBodyStatus).toBe('skipped_binary');
      expect(events[0].responseBody).toBeUndefined();
      expect(mockResponse.clone).not.toHaveBeenCalled();
    });

    it('should set responseBodyStatus to "error" when body read fails', async () => {
      const mockClone = { text: jest.fn().mockRejectedValue(new Error('read error')) };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('application/json', 'content-type');
          },
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true } });

      await globalScope.fetch('https://api.example.com/data');
      await Promise.resolve();

      expect(events[0].responseBodyStatus).toBe('error');
      expect(events[0].responseBody).toBeUndefined();
    });

    it('should not capture response body when body.response is false', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
        clone: jest.fn(),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: false } });

      await globalScope.fetch('https://api.example.com/data');

      expect(events[0].responseBodyStatus).toBeUndefined();
      expect(events[0].responseBody).toBeUndefined();
      expect(mockResponse.clone).not.toHaveBeenCalled();
    });

    it('should capture response body when no content-type header present', async () => {
      const mockClone = { text: jest.fn().mockResolvedValue('plain text') };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: jest.fn(), // no content-type emitted
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { response: true } });

      await globalScope.fetch('https://api.example.com/data');
      await Promise.resolve();

      expect(events[0].responseBody).toBe('plain text');
      expect(events[0].responseBodyStatus).toBe('captured');
    });

    it('should not capture response body when body config is absent', async () => {
      const mockResponse = {
        status: 200,
        headers: { forEach: jest.fn() },
        clone: jest.fn(),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback);

      await globalScope.fetch('https://api.example.com/data');

      expect(events[0].responseBodyStatus).toBeUndefined();
      expect(events[0].responseBody).toBeUndefined();
      expect(mockResponse.clone).not.toHaveBeenCalled();
    });

    it('should capture both request and response body when both enabled', async () => {
      const mockClone = { text: jest.fn().mockResolvedValue('response text') };
      const mockResponse = {
        status: 200,
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            cb('text/plain', 'content-type');
          },
        },
        clone: jest.fn().mockReturnValue(mockClone),
      };
      mockFetch.mockResolvedValue(mockResponse);
      networkObservers.start(callback, { enabled: true, body: { request: true, response: true } });

      await globalScope.fetch('https://api.example.com/data', {
        method: 'POST',
        body: 'request text',
      });
      await Promise.resolve();

      expect(events[0].requestBody).toBe('request text');
      expect(events[0].responseBody).toBe('response text');
      expect(events[0].responseBodyStatus).toBe('captured');
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
