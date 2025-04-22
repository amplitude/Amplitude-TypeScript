// make a test class that implements NetworkRequestEvent
import {
  BrowserClient,
  BrowserConfig,
  CookieStorage,
  FetchTransport,
  Logger,
  LogLevel,
  NetworkEventCallback,
  NetworkObserver,
  NetworkRequestEvent,
} from '@amplitude/analytics-core';
import { shouldTrackNetworkEvent } from '../../src/autocapture/track-network-event';
import { NetworkTrackingOptions } from '@amplitude/analytics-core/lib/esm/types/network-tracking';
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { autocapturePlugin } from '../../src/autocapture-plugin';
import { AMPLITUDE_NETWORK_REQUEST_EVENT } from '../../src/constants';

class MockNetworkRequestEvent implements NetworkRequestEvent {
  constructor(
    public url: string = 'https://example.com',
    public type: string = 'fetch',
    public method: string = 'GET',
    public status: number = 200,
    public duration: number = 100,
    public responseBodySize: number = 100,
    public requestBodySize: number = 100,
    public requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    },
    public startTime: number = Date.now(),
    public timestamp: number = Date.now(),
    public endTime: number = Date.now() + 100,
  ) {
    this.type = 'fetch';
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
      console.log('adding callback', cb);
      eventCallbacks.push(cb);
      return () => {
        eventCallbacks = [];
      };
    });

    beforeEach(async () => {
      client = new AmplitudeBrowser();
      trackSpy = jest.spyOn(client, 'track');
      client.init('<FAKE_API_KEY>', undefined, localConfig);
      jest.spyOn(NetworkObserver, 'subscribe').mockImplementation(subscribe);
      const plugin = autocapturePlugin();
      await plugin.setup?.(localConfig, client);
    });

    test('should track a fetch that returns 500 status code', async () => {
      eventCallbacks.forEach((cb: NetworkEventCallback) => {
        cb.callback({
          url: 'https://example.com/track?hello=world#hash',
          type: 'fetch',
          method: 'POST',
          status: 500,
          duration: 100,
          responseBodySize: 100,
          requestBodySize: 100,
          requestHeaders: {
            'Content-Type': 'application/json',
          },
          startTime: Date.now(),
          timestamp: Date.now(),
          endTime: Date.now() + 100,
        });
      });
      const networkEventCall = trackSpy.mock.calls.find((call) => {
        return call[0] === AMPLITUDE_NETWORK_REQUEST_EVENT;
      });
      const [eventName, eventProperties] = networkEventCall;
      expect(eventName).toBe(AMPLITUDE_NETWORK_REQUEST_EVENT);
      expect(eventProperties).toEqual({
        url: 'https://example.com/track?hello=world#hash',
        urlQuery: 'hello=world',
        urlFragment: '#hash',
        method: 'POST',
        statusCode: 500,
        startTime: expect.any(Number),
        completionTime: expect.any(Number),
        duration: expect.any(Number),
        requestBodySize: 100,
        responseBodySize: 100,
      });
    });

    test('should not track a fetch that returns 200 status code', async () => {
      eventCallbacks.forEach((cb: NetworkEventCallback) => {
        cb.callback({
          url: 'https://example.com/track?hello=world#hash',
          type: 'fetch',
          method: 'POST',
          status: 200,
          duration: 100,
          responseBodySize: 100,
          requestBodySize: 100,
          requestHeaders: {
            'Content-Type': 'application/json',
          },
          startTime: Date.now(),
          timestamp: Date.now(),
          endTime: Date.now() + 100,
        });
      });
      const networkEventCall = trackSpy.mock.calls.find((call) => {
        return call[0] === AMPLITUDE_NETWORK_REQUEST_EVENT;
      });
      expect(networkEventCall).toBeUndefined();
    });
  });

  describe('shouldTrackNetworkEvent is false', () => {
    test('domain is amplitude.com', () => {
      networkEvent.url = 'https://api.amplitude.com/track';
      expect(shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions)).toBe(
        false,
      );
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
  });

  describe('shouldTrackNetworkEvent returns true when', () => {
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
  });
});
