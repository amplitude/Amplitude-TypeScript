import { NetworkEventCallback, NetworkRequestEvent, networkObserver } from '../src/index';
import {
  FetchRequestBody,
  NetworkObserver,
  RequestWrapper,
  ResponseWrapper,
  serializeNetworkRequestEvent,
} from '../src/network-observer';
import * as AnalyticsCore from '../src/index';
import { TextEncoder } from 'util';
import * as streams from 'stream/web';
import * as Global from '../src/global-scope';
type PartialGlobal = Pick<typeof globalThis, 'fetch'>;

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

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

  let originalFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

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
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
      expect(events[0].requestWrapper?.headers).toEqual(requestHeaders);
      expect(events[0].requestWrapper?.headers).toEqual(requestHeaders); // 2x to check that it's cached
      const expectedResponseHeaders = {
        'content-type': 'application/json',
        'content-length': '20',
        server: 'test-server',
      };
      expect(events[0].responseWrapper?.headers).toEqual(expectedResponseHeaders);
      expect(events[0].responseWrapper?.headers).toEqual(expectedResponseHeaders);
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
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
      expect(events[0].requestWrapper?.headers).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer token123',
      });
      expect(events[0].responseWrapper?.headers).toEqual({
        'content-type': 'application/json',
        'content-length': '20',
        server: 'test-server',
      });
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
      });
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
      expect(events[0].requestWrapper?.headers).toEqual(undefined);
      expect(events[0].responseWrapper?.headers).toEqual({});
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

    it('should track successful fetch requests formed with request object', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          forEach: jest.fn(), // Mock function that does nothing
        },
      };
      originalFetchMock.mockResolvedValue(mockResponse);

      networkObserver.subscribe(new NetworkEventCallback(callback));

      const req = {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"message": "Hello from mock!"}',
      } as any;
      await globalScope.fetch(req);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'fetch',
        method: 'POST',
        url: 'https://api.example.com/data',
        status: 200,
      });
    });
  });

  describe('failed requests', () => {
    it('should track network errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      originalFetchMock.mockRejectedValue(networkError);

      networkObserver.subscribe(new NetworkEventCallback(callback));

      await expect(globalScope.fetch('https://api.example.com/data')).rejects.toThrow('Failed to fetch');

      expect(events).toHaveLength(1);
      const networkRequestEvent = events[0];
      console.log(networkRequestEvent.toSerializable().endTime);
      expect(networkRequestEvent.toSerializable()).toEqual({
        type: 'fetch',
        method: 'GET',
        url: 'https://api.example.com/data',
        error: {
          name: 'TypeError',
          message: 'Failed to fetch',
        },
        duration: networkRequestEvent.duration,
        status: networkRequestEvent.status,
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        timestamp: expect.any(Number),
        requestHeaders: networkRequestEvent.requestWrapper?.headers,
        requestBodySize: networkRequestEvent.requestWrapper?.bodySize,
        responseHeaders: networkRequestEvent.responseWrapper?.headers,
        responseBodySize: networkRequestEvent.responseWrapper?.bodySize,
      });
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
        toSerializable: () => ({ ...mockEvent }),
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

  describe('RequestWrapper', () => {
    describe('bodySize should return the body length when the body is of type', () => {
      it('string', () => {
        const body = 'Hello World!';
        const requestWrapper = new RequestWrapper({
          body,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBe(body.length);
        expect(requestWrapper.bodySize).toBe(body.length); // do it again to make sure it's cached
      });
      it('Blob', () => {
        const blob = new Blob(['Hello World!']);
        const requestWrapper = new RequestWrapper({
          body: blob,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBe(blob.size);
      });
      it('ArrayBuffer', () => {
        const buffer = new ArrayBuffer(8);
        const requestWrapper = new RequestWrapper({
          body: buffer,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBe(buffer.byteLength);
      });

      it('ArrayBufferView', () => {
        const buffer = new ArrayBuffer(8);
        const arr = new Uint8Array(buffer);
        const requestWrapper = new RequestWrapper({
          body: arr,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBe(arr.byteLength);
      });
      it('FormData', () => {
        const formData = new FormData();
        const val = 'value';
        formData.append('key', val);
        const blob = new Blob(['Hello World!']);
        formData.append('file', blob);
        const expectedSize = val.length + blob.size + 'key'.length + 'file'.length;
        const requestWrapper = new RequestWrapper({
          body: formData as unknown as FetchRequestBody,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBe(expectedSize);
      });
      it('URLSearchParams', () => {
        const params = new URLSearchParams();
        const val = 'value';
        params.append('key', val);
        const val2 = 'value2';
        params.append('key2', val2);
        const expectedSize = 'key='.length + val.length + '&key2='.length + val2.length;
        const requestWrapper = new RequestWrapper({
          body: params,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBe(expectedSize);
      });
    });

    describe('bodySize should return undefined when', () => {
      it('FormData has >100 entries', () => {
        const formData = new FormData();
        for (let i = 0; i < 101; i++) {
          formData.append(`key${i}`, `value${i}`);
        }
        const requestWrapper = new RequestWrapper({
          body: formData as unknown as FetchRequestBody,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBeUndefined();
      });
      it('body is undefined', () => {
        const body = undefined;
        const requestWrapper = new RequestWrapper({
          body,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBeUndefined();
      });
      it('globalScope is not available', () => {
        jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);
        const body = 'Hello World!';
        const requestWrapper = new RequestWrapper({
          body,
        } as RequestInit);
        expect(requestWrapper.bodySize).toBeUndefined();
      });
    });

    describe('headers should return an object', () => {
      it('when headers is an array', () => {
        const requestWrapper = new RequestWrapper({
          headers: [
            ['Content-Type', 'application/fake'],
            ['Content-Length', '1234'],
          ],
        } as RequestInit);
        expect(requestWrapper.headers).toEqual({
          'Content-Type': 'application/fake',
          'Content-Length': '1234',
        });
      });
    });
  });

  describe('responseWrapper', () => {
    const mockResponse = {
      body: null,
      bodyUsed: false,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      ok: true,
      redirected: false,
      status: 200,
      statusText: 'OK',
      type: 'basic',
      url: 'https://api.example.com/data',
      clone: () => mockResponse,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      json: async () => ({ message: 'Hello from mock!' }),
      text: async () => '{"message": "Hello from mock!"}',
    };

    test('bodySize should return undefined if content-length is not set', () => {
      const responseWrapper = new ResponseWrapper(mockResponse as unknown as Response);
      const bodySize = responseWrapper.bodySize;
      expect(bodySize).toBeUndefined();
    });

    test('bodySize should return the content-length if set', () => {
      const responseWithContentLength = {
        ...mockResponse,
        headers: new Headers({ 'Content-Type': 'application/json', 'Content-Length': '1234' }),
      };
      const responseWrapper = new ResponseWrapper(responseWithContentLength as unknown as Response);
      expect(responseWrapper.bodySize).toBe(1234);
      expect(responseWrapper.bodySize).toBe(1234); // 2x to check that it's cached
    });
  });
});

describe('serializeNetworkRequestEvent', () => {
  it('should serialize a NetworkRequestEvent', () => {
    const event = {
      type: 'fetch',
      method: 'GET',
      url: 'https://api.example.com/data',
      status: 200,
      duration: 100,
      startTime: 100,
      endTime: 200,
      timestamp: 100,
      requestWrapper: {
        bodySize: 100,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      responseWrapper: {
        bodySize: 100,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    } as unknown as NetworkRequestEvent;
    const serialized = serializeNetworkRequestEvent(event);
    expect(serialized).toEqual({
      type: 'fetch',
      method: 'GET',
      url: 'https://api.example.com/data',
      status: 200,
      duration: 100,
      startTime: 100,
      endTime: 200,
      timestamp: 100,
      requestBodySize: 100,
      requestHeaders: {
        'Content-Type': 'application/json',
      },
      responseBodySize: 100,
      responseHeaders: {
        'Content-Type': 'application/json',
      },
    });
  });
});

describe('networkObserver', () => {
  test('should be an instance of NetworkObserver', () => {
    expect(networkObserver).toBeInstanceOf(NetworkObserver);
  });
});
