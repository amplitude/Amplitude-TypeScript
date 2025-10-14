import type { BrowserClient, BrowserConfig } from '@amplitude/analytics-types';
import { LogLevel } from '@amplitude/analytics-types';
import { customEnrichmentPlugin } from '../src/custom-enrichment';
import { Logger } from '@amplitude/analytics-core';
import type { ILogger } from '@amplitude/analytics-core';

// Mock BrowserClient implementation
const createMockBrowserClient = (): jest.Mocked<BrowserClient> => {
  const mockClient = {
    init: jest.fn().mockReturnValue({
      promise: Promise.resolve(),
    }),
    add: jest.fn(),
    remove: jest.fn(),
    track: jest.fn(),
    logEvent: jest.fn(),
    identify: jest.fn(),
    groupIdentify: jest.fn(),
    setGroup: jest.fn(),
    revenue: jest.fn(),
    flush: jest.fn(),
    getUserId: jest.fn(),
    setUserId: jest.fn(),
    getDeviceId: jest.fn(),
    setDeviceId: jest.fn(),
    getSessionId: jest.fn(),
    setSessionId: jest.fn(),
    extendSession: jest.fn(),
    reset: jest.fn(),
    setOptOut: jest.fn(),
    setTransport: jest.fn(),
  } as unknown as jest.Mocked<BrowserClient>;

  mockClient.track.mockReturnValue({
    promise: Promise.resolve({
      code: 200,
      message: '',
      event: {
        event_type: 'test-event',
      },
    }),
  });

  return mockClient;
};

const createMockConfig = (): BrowserConfig => ({
  apiKey: 'test-api-key',
  flushQueueSize: 10,
  flushIntervalMillis: 1000,
  logLevel: LogLevel.Verbose,
  loggerProvider: new Logger(),
  sessionTimeout: 30000,
  flushMaxRetries: 5,
  optOut: false,
  useBatch: false,
  fetchRemoteConfig: false,
  trackingOptions: {
    ipAddress: true,
    language: true,
    platform: true,
  },
  cookieStorage: {
    isEnabled: jest.fn().mockReturnValue(true),
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    reset: jest.fn(),
    getRaw: jest.fn(),
  },
  storageProvider: {
    isEnabled: jest.fn().mockReturnValue(true),
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    reset: jest.fn(),
    getRaw: jest.fn(),
  },
  transportProvider: {
    send: jest.fn(),
  },
});

describe('Custom Enrichment Plugin', () => {
  let mockClient: jest.Mocked<BrowserClient>;
  let mockConfig: BrowserConfig;
  let mockLogger: ILogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockBrowserClient();
    mockConfig = createMockConfig();
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      logLevel: LogLevel.Verbose,
      disable: jest.fn(),
      enable: jest.fn(),
    } as ILogger;
    mockConfig.loggerProvider = mockLogger;
  });
  describe('execute', () => {
    it('should execute custom enrichment function successfully', async () => {
      const customFunction = `
        event.event_properties = event.event_properties || {};
        event.event_properties.custom_field = 'enriched_value';
        return event;
      `;
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the custom function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: customFunction });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = {
        event_type: 'test_event',
        event_properties: { original: 'value' },
      };

      const result = await plugin.execute?.(originalEvent);

      expect(result).toEqual({
        event_type: 'test_event',
        event_properties: {
          original: 'value',
          custom_field: 'enriched_value',
        },
      });
    });

    it('should handle enrichment function that adds or modifies the event', async () => {
      const timestamp = Date.now();
      const customFunction = `
        event.user_properties = { custom_user_prop: 'user_value' };
        event.event_properties = { ...event.event_properties, timestamp: ${timestamp} };
        event.event_type = 'enriched_event';
        return event;
      `;
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the custom function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: customFunction });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = {
        event_type: 'test_event',
        event_properties: { test: 'value' },
      };

      const result = await plugin.execute?.(originalEvent);

      expect(result?.event_type).toBe('enriched_event');
      expect(result?.event_properties).toStrictEqual({ test: 'value', timestamp: timestamp });
      expect(result?.user_properties).toStrictEqual({ custom_user_prop: 'user_value' });
    });

    it('should return original event if enrichment function throws error', async () => {
      const invalidFunction = `
        throw new Error('Invalid enrichment function');
      `;
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the invalid function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: invalidFunction });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      expect(result).toEqual(originalEvent);
      expect((mockLogger.error as jest.Mock).mock.calls.length).toBe(1);
      expect((mockLogger.error as jest.Mock).mock.calls[0][0]).toBe('Could not execute custom enrichment function');
    });

    it('should handle undefined loggerProvider in execute error case', async () => {
      const configWithoutLogger = { ...mockConfig, loggerProvider: undefined as unknown as Logger } as BrowserConfig;
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the error function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: 'throw new Error("test error");' });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...configWithoutLogger,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      // Should return original event even with undefined loggerProvider
      expect(result).toEqual(originalEvent);
    });

    it('should return original event if enrichment function is invalid', async () => {
      const invalidFunction = 'invalid javascript syntax {';
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the invalid function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: invalidFunction });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      expect(result).toEqual(originalEvent);
      expect((mockLogger.error as jest.Mock).mock.calls.length).toBe(1);
      expect((mockLogger.error as jest.Mock).mock.calls[0][0]).toBe('Could not execute custom enrichment function');
    });

    it('should return original event if enrichment function does not return an event', async () => {
      const customFunction = `
        // Function that doesn't return anything
        event.event_properties = { modified: true };
      `;
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the custom function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: customFunction });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      // Should return the original event since the function didn't return anything
      expect(result).toEqual(originalEvent);
    });

    it('should handle empty enrichment function', async () => {
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide empty function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: '' });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      expect(result).toEqual(originalEvent);
    });

    it('should handle enrichment function with only comments', async () => {
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide comment-only function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: '// This is just a comment' });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      expect(result).toEqual(originalEvent);
    });
  });

  describe('remote config integration', () => {
    it('should handle missing remote config client', async () => {
      const plugin = customEnrichmentPlugin();

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: undefined,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      // Should return original event when no remote config is available
      expect(result).toEqual(originalEvent);
      expect((mockLogger.debug as jest.Mock).mock.calls.length).toBe(1);
      expect((mockLogger.debug as jest.Mock).mock.calls[0][0]).toBe(
        'Remote config client is not provided, skipping remote config fetch',
      );
    });

    it('should handle fetchRemoteConfig disabled', async () => {
      const plugin = customEnrichmentPlugin();

      const configWithoutRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: false,
      };

      await plugin.setup?.(configWithoutRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      // Should return original event when remote config is disabled
      expect(result).toEqual(originalEvent);
    });

    it('should handle remote config subscription', async () => {
      const plugin = customEnrichmentPlugin();

      const mockRemoteConfigClient = {
        subscribe: jest.fn(),
      };

      const configWithRemoteConfig = {
        ...mockConfig,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      // Verify that subscribe was called with the correct parameters
      expect(mockRemoteConfigClient.subscribe).toHaveBeenCalled();
      expect(mockRemoteConfigClient.subscribe.mock.calls[0][0]).toBe('analyticsSDK.customEnrichment');
      expect(mockRemoteConfigClient.subscribe.mock.calls[0][1]).toBe('all');
      expect(typeof mockRemoteConfigClient.subscribe.mock.calls[0][2]).toBe('function');
    });
  });

  describe('teardown', () => {
    it('should complete teardown without errors', async () => {
      const plugin = customEnrichmentPlugin();
      await plugin.setup?.(mockConfig, mockClient);
      await expect(plugin.teardown?.()).resolves.toBeUndefined();
    });
  });

  describe('undefined loggerProvider', () => {
    it('should handle undefined loggerProvider in setup', async () => {
      const configWithoutLogger = { ...mockConfig, loggerProvider: undefined } as unknown as BrowserConfig;
      const plugin = customEnrichmentPlugin();

      // Should not throw an error even with undefined loggerProvider
      await expect(plugin.setup?.(configWithoutLogger, mockClient)).resolves.toBeUndefined();
    });

    it('should handle undefined loggerProvider in execute error case', async () => {
      const configWithoutLogger = { ...mockConfig, loggerProvider: undefined } as unknown as BrowserConfig;
      const plugin = customEnrichmentPlugin();

      // Mock remote config to provide the error function
      const mockRemoteConfigClient = {
        subscribe: jest.fn((key, _audience, callback) => {
          if (key === 'analyticsSDK.customEnrichment') {
            callback({ body: 'throw new Error("test error");' });
          }
        }),
      };

      const configWithRemoteConfig = {
        ...configWithoutLogger,
        fetchRemoteConfig: true,
        remoteConfigClient: mockRemoteConfigClient,
      };

      await plugin.setup?.(configWithRemoteConfig, mockClient);

      const originalEvent = { event_type: 'test_event' };
      const result = await plugin.execute?.(originalEvent);

      // Should return original event and not throw even with undefined loggerProvider
      expect(result).toEqual(originalEvent);
    });
  });
});
