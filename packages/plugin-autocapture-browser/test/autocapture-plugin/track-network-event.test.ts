// make a test class that implements NetworkRequestEvent
import { BrowserConfig, CookieStorage, FetchTransport, Logger, LogLevel, NetworkRequestEvent } from '@amplitude/analytics-core';
import { shouldTrackNetworkEvent } from '../../src/autocapture/track-network-event';
import { NetworkTrackingOptions } from '@amplitude/analytics-core/lib/esm/types/network-tracking';

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

  describe('shouldTrackNetworkEvent is false', () => {
    test('domain is amplitude.com', () => {
      networkEvent.url = 'https://api.amplitude.com/track';
      expect(shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions)).toBe(false);
    });

    test('domain is in ignoreHosts', () => {
      localConfig.networkTrackingOptions = { ignoreHosts: ['example.com'] };
      networkEvent.url = 'https://example.com/track';
      expect(shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions)).toBe(false);
    });

    test('domain matches a wildcard in ignoreHosts', () => {
      localConfig.networkTrackingOptions = { ignoreHosts: ['*.example.com', 'dummy.url'] };
      networkEvent.url = 'https://sub.example.com/track';
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions);
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
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions);
      expect(result).toBe(false);
    });
  });
  
  describe('shouldTrackNetworkEvent returns true when', () => {
    test('domain is api.amplitude.com and ignoreAmplitudeRequests is false', () => {
      localConfig.networkTrackingOptions = { ignoreAmplitudeRequests: false };
      networkEvent.url = 'https://api.amplitude.com/track';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions);
      expect(result).toBe(true);
    });

    test('domain is amplitude.com and ignoreAmplitudeRequests is false', () => {
      localConfig.networkTrackingOptions = { ignoreAmplitudeRequests: false };
      networkEvent.url = 'https://amplitude.com/track';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions);
      expect(result).toBe(true);
    });
    
    test('status code is 500', () => {
      networkEvent.url = 'https://notamplitude.com/track';
      networkEvent.status = 500;
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions);
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
      const result = shouldTrackNetworkEvent(networkEvent, localConfig.networkTrackingOptions as NetworkTrackingOptions);
      expect(result).toBe(true);
    });
  });
});
