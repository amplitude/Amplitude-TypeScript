// make a test class that implements NetworkRequestEvent
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BrowserClient,
  BrowserConfig,
  CookieStorage,
  FetchTransport,
  Logger,
  LogLevel,
  NetworkEventCallback,
  networkObserver,
  NetworkRequestEvent,
} from '@amplitude/analytics-core';
import * as AnalyticsCore from '@amplitude/analytics-core';
import { shouldTrackNetworkEvent } from '../../src/track-network-event';
import { NetworkTrackingOptions } from '@amplitude/analytics-core/lib/esm/types/network-tracking';
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { BrowserEnrichmentPlugin, networkCapturePlugin } from '../../src/network-capture-plugin';
import { AMPLITUDE_NETWORK_REQUEST_EVENT } from '../../src/constants';
import { VERSION } from '../../src/version';
import * as streams from 'stream/web';
import { TextEncoder } from 'util';
type PartialGlobal = Pick<typeof globalThis, 'fetch'>;

type ResourceType = 'fetch' | 'xhr';

class MockNetworkRequestEvent implements NetworkRequestEvent {
  constructor(
    public url: string = 'https://example.com',
    public type: ResourceType = 'fetch',
    public method: string = 'GET',
    public status: number = 200,
    public duration: number = 100,
    public responseWrapper = {
      bodySize: 100,
      headers: {
        'Content-Type': 'application/json',
      },
    } as any,
    public requestWrapper = {
      bodySize: 100,
      headers: {
        'Content-Type': 'application/json',
      },
    } as any,
    public startTime: number = Date.now(),
    public timestamp: number = Date.now(),
    public endTime: number = Date.now() + 100,
  ) {
    this.type = 'fetch';
  }

  toSerializable(): Record<string, any> {
    return {
      ...this,
      responseBodySize: this.responseWrapper.bodySize,
      requestBodySize: this.requestWrapper.bodySize,
      requestHeaders: this.requestWrapper.headers,
      responseHeaders: this.responseWrapper.headers,
    };
  }
}

const baseBrowserConfig: BrowserConfig = {
  apiKey: '<FAKE_API_KEY>',
  flushIntervalMillis: 0,
  flushMaxRetries: 0,
  flushQueueSize: 0,
  logLevel: LogLevel.None,
  loggerProvider: new Logger(),
  offline: false,
  optOut: false,
  serverUrl: undefined,
  transportProvider: new FetchTransport(),
  useBatch: false,
  cookieOptions: {
    domain: '.amplitude.com',
    expiration: 365,
    sameSite: 'Lax',
    secure: false,
    upgrade: true,
  },
  cookieStorage: new CookieStorage(),
  sessionTimeout: 30 * 60 * 1000,
  trackingOptions: {
    ipAddress: true,
    language: true,
    platform: true,
  },
};

describe('track-network-event', () => {
  let networkEvent: MockNetworkRequestEvent;
  let localConfig: BrowserConfig;
  beforeEach(() => {
    localConfig = {
      ...baseBrowserConfig,
      autocapture: {
        networkTracking: true,
      },
      networkTrackingOptions: {},
    } as BrowserConfig;
    networkEvent = new MockNetworkRequestEvent();
  });

  describe('trackNetworkEvent()', () => {
    let client: BrowserClient;
    let trackSpy: jest.SpyInstance;
    let eventCallbacks: any[] = [];
    const subscribe = jest.fn((cb: NetworkEventCallback) => {
      eventCallbacks.push(cb);
      return () => {
        eventCallbacks = [];
      };
    });

    let plugin: BrowserEnrichmentPlugin;
    let amendedGlobalScope: PartialGlobal;
    let originalFetchMock: jest.Mock;

    beforeEach(async () => {
      originalFetchMock = jest.fn();
      amendedGlobalScope = {
        fetch: originalFetchMock,
        TextEncoder,
        ReadableStream: streams,
      } as PartialGlobal;
      // keep reference to original getGlobalScope
      const originalGetGlobalScope = AnalyticsCore.getGlobalScope;
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockImplementation((): any => {
        return {
          ...originalGetGlobalScope(),
          ...amendedGlobalScope,
        };
      });

      client = new AmplitudeBrowser();
      trackSpy = jest.spyOn(client, 'track');
      client.init('<FAKE_API_KEY>', undefined, localConfig);
      jest.spyOn(networkObserver, 'subscribe').mockImplementation(subscribe);
      plugin = networkCapturePlugin();
      await plugin.setup?.(localConfig, client);
    });

    afterEach(async () => {
      await plugin?.teardown?.();
    });

    test('should track a network request event with status=500', async () => {
      const responseHeaders = new Headers();
      responseHeaders.set('content-length', '100');
      eventCallbacks.forEach((cb: NetworkEventCallback) => {
        cb.callback({
          url: 'https://example.com/track?hello=world#hash',
          type: 'fetch',
          method: 'POST',
          status: 500,
          duration: 100,
          requestWrapper: {
            bodySize: 10,
            headers: { 'content-type': 'application/json' },
          } as any,
          responseWrapper: {
            bodySize: 100,
            headers: { 'content-length': '100' },
          } as any,
          startTime: Date.now(),
          timestamp: Date.now(),
          endTime: Date.now() + 100,
          toSerializable: () => networkEvent.toSerializable(),
        });
      });
      const networkEventCall = trackSpy.mock.calls.find((call) => {
        return call[0] === AMPLITUDE_NETWORK_REQUEST_EVENT;
      });
      const [eventName, eventProperties] = networkEventCall;
      expect(eventName).toBe(AMPLITUDE_NETWORK_REQUEST_EVENT);
      expect(eventProperties).toEqual({
        '[Amplitude] URL': 'https://example.com/track',
        '[Amplitude] URL Query': 'hello=world',
        '[Amplitude] URL Fragment': 'hash',
        '[Amplitude] Request Method': 'POST',
        '[Amplitude] Status Code': 500,
        '[Amplitude] Start Time': expect.any(Number),
        '[Amplitude] Completion Time': expect.any(Number),
        '[Amplitude] Duration': expect.any(Number),
        '[Amplitude] Request Body Size': 10,
        '[Amplitude] Response Body Size': 100,
        '[Amplitude] Request Type': 'fetch',
      });
    });

    test('should track a network request event with status=500 and network request missing attributes', async () => {
      eventCallbacks.forEach((cb: NetworkEventCallback) => {
        cb.callback({
          url: 'https://example.com/track?hello=world#hash',
          type: 'xhr',
          method: 'POST',
          status: 500,
          duration: 100,
          requestWrapper: {
            bodySize: undefined,
            headers: { 'content-type': 'application/json' },
          } as any,
          timestamp: Date.now(),
          startTime: Date.now(),
          endTime: Date.now() + 100,
          toSerializable: () => networkEvent.toSerializable(),
        });
      });
      const networkEventCall = trackSpy.mock.calls.find((call) => {
        return call[0] === AMPLITUDE_NETWORK_REQUEST_EVENT;
      });
      const [eventName, eventProperties] = networkEventCall;
      expect(eventName).toBe(AMPLITUDE_NETWORK_REQUEST_EVENT);
      expect(eventProperties).toEqual({
        '[Amplitude] URL': 'https://example.com/track',
        '[Amplitude] URL Query': 'hello=world',
        '[Amplitude] URL Fragment': 'hash',
        '[Amplitude] Request Method': 'POST',
        '[Amplitude] Status Code': 500,
        '[Amplitude] Start Time': expect.any(Number),
        '[Amplitude] Completion Time': expect.any(Number),
        '[Amplitude] Duration': expect.any(Number),
        '[Amplitude] Request Body Size': undefined,
        '[Amplitude] Response Body Size': undefined,
        '[Amplitude] Request Type': 'xhr',
      });
    });

    test('should not track a network request event with status=200', async () => {
      eventCallbacks.forEach((cb: NetworkEventCallback) => {
        cb.callback({
          url: 'https://example.com/track?hello=world#hash',
          type: 'fetch',
          method: 'POST',
          status: 200,
          duration: 100,
          requestWrapper: {
            bodySize: 10,
            headers: { 'content-type': 'application/json' },
          } as any,
          startTime: Date.now(),
          timestamp: Date.now(),
          endTime: Date.now() + 100,
          toSerializable: () => networkEvent.toSerializable(),
        });
      });
      const networkEventCall = trackSpy.mock.calls.find((call) => {
        return call[0] === AMPLITUDE_NETWORK_REQUEST_EVENT;
      });
      expect(networkEventCall).toBeUndefined();
    });

    test('should not track event if request event is missing URL', () => {
      eventCallbacks.forEach((cb: NetworkEventCallback) => {
        const event = {
          type: 'fetch',
          method: 'POST',
          status: 500,
          duration: 100,
          requestWrapper: {
            bodySize: 10,
            headers: { 'content-type': 'application/json' },
          } as any,
          startTime: Date.now(),
          timestamp: Date.now(),
          endTime: Date.now() + 100,
        } as NetworkRequestEvent;
        cb.callback({
          ...event,
          toSerializable: () => event,
        });
      });
      const networkEventCall = trackSpy.mock.calls.find((call) => {
        return call[0] === AMPLITUDE_NETWORK_REQUEST_EVENT;
      });
      expect(networkEventCall).toBeUndefined();
    });
  });

  describe('shouldTrackNetworkEvent returns false when', () => {
    test('status code is empty', () => {
      const networkEvent = new MockNetworkRequestEvent(
        'fetch',
        undefined,
        'POST',
        0,
        0,
        'https://example.com/track',
        // leave status empty
      );
      const result = shouldTrackNetworkEvent(
        networkEvent,
        localConfig.networkTrackingOptions as NetworkTrackingOptions,
      );
      expect(result).toBe(false);
    });

    test('domain is amplitude.com', () => {
      networkEvent.url = 'https://api.amplitude.com/track';
      expect(shouldTrackNetworkEvent(networkEvent)).toBe(false);
    });

    test('domain is in ignoreHosts', () => {
      localConfig.networkTrackingOptions = { ignoreHosts: ['example.com'] };
      networkEvent.url = 'https://example.com/track';
      expect(shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions)).toBe(false);
    });

    test('domain matches a wildcard in ignoreHosts', () => {
      localConfig.networkTrackingOptions = { ignoreHosts: ['*.example.com', 'dummy.url'] };
      networkEvent.url = 'https://sub.example.com/track';
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(false);
    });

    test('host is not in one of the captureRules', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['example.com'],
          },
        ],
      };
      networkEvent.url = 'https://otherexample.com/apicall';
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(false);
    });

    test('status code is 403 and 400 is in the forbidden status codes', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['example.com'],
            statusCodeRange: '404-599',
          },
        ],
      };
      networkEvent.url = 'https://example.com/track';
      networkEvent.status = 403;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(false);
    });

    test('status code is 400 and no status code range is defined', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['example.com'],
          },
        ],
      };
      networkEvent.url = 'https://example.com/track';
      networkEvent.status = 400;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(false);
    });

    test('status code is 200 and no captureRules are defined', () => {
      networkEvent.url = 'https://notamplitude.com/track';
      networkEvent.status = 200;
      const result = shouldTrackNetworkEvent(
        networkEvent,
        localConfig.networkTrackingOptions as NetworkTrackingOptions,
      );
      expect(result).toBe(false);
    });

    test('status code is 0 and no captureRules are defined', () => {
      networkEvent.url = 'https://notamplitude.com/track';
      networkEvent.status = 0;
      const result = shouldTrackNetworkEvent(
        networkEvent,
        localConfig.networkTrackingOptions as NetworkTrackingOptions,
      );
      expect(result).toBe(false);
    });

    test('host matches in captureRules but status code is not in the range', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['*'],
            statusCodeRange: '200-299',
          },
          {
            hosts: ['example.com'],
            statusCodeRange: '500-599',
          },
        ],
      };
      networkEvent.url = 'https://example.com/track';
      networkEvent.status = 200;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(false);
    });
  });

  describe('shouldTrackNetworkEvent returns true when', () => {
    const defaultHref = window.location.href;

    beforeAll(() => {
      window.location.href = 'https://example.com';
    });

    afterAll(() => {
      window.location.href = defaultHref;
    });

    test('url omits baseURL and window.location.href is not ignored', () => {
      networkEvent.url = '/some/url';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('url is a relative URL and location.href is not ignored', () => {
      networkEvent.url = 'relativeurl';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('domain is api.amplitude.com and ignoreAmplitudeRequests is false', () => {
      localConfig.networkTrackingOptions = { ignoreAmplitudeRequests: false };
      networkEvent.url = 'https://api.amplitude.com/track';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('domain is amplitude.com and ignoreAmplitudeRequests is false', () => {
      localConfig.networkTrackingOptions = { ignoreAmplitudeRequests: false };
      networkEvent.url = 'https://amplitude.com/track';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('status code is 500', () => {
      networkEvent.url = 'https://notamplitude.com/track';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(
        networkEvent,
        localConfig.networkTrackingOptions as NetworkTrackingOptions,
      );
      expect(result).toBe(true);
    });

    test('status code is 0', () => {
      networkEvent.url = 'https://notamplitude.com/track';
      networkEvent.status = 0;
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['notamplitude.com'],
            statusCodeRange: '0,400-499',
          },
        ],
      };
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('status code is 200 and 200 is allowed in captureRules', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['example.com'],
            statusCodeRange: '200',
          },
        ],
      };
      networkEvent.url = 'https://example.com/track';
      networkEvent.status = 200;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('status code is 403 and 400 is within the statusCodeRange', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['example.com'],
            statusCodeRange: '402-599',
          },
        ],
      };
      networkEvent.url = 'https://example.com/track';
      networkEvent.status = 403;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });

    test('host does not match with second capture rule but matches with first', () => {
      localConfig.networkTrackingOptions = {
        captureRules: [
          {
            hosts: ['*.example.com'],
            statusCodeRange: '400-499',
          },
          {
            hosts: ['otherexample.com'],
            statusCodeRange: '400-599',
          },
        ],
      };
      networkEvent.url = 'https://some.example.com/track';
      networkEvent.status = 403;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions);
      expect(result).toBe(true);
    });
  });
});

describe('version', () => {
  test('should return the plugin version', () => {
    expect(VERSION != null).toBe(true);
  });
});
