import { createInstance } from '@amplitude/analytics-browser';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { uaParserPlugin } from '../src/ua-parser-plugin';
import { BaseEvent, BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { Logger, UUID } from '@amplitude/analytics-core';

describe('uaParserPlugin', () => {
  let event: BaseEvent;

  const mockConfig: BrowserConfig = {
    apiKey: UUID(),
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(), //        log: jest.fn()
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

  beforeEach(() => {
    event = {
      event_type: 'event_type',
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    test('should overwirte all devices info without option', async () => {
      const amplitude = createInstance();

      const uaParserEnrichmentPlugin = uaParserPlugin();
      const executeSpy = jest.spyOn(uaParserEnrichmentPlugin, 'execute');

      await uaParserEnrichmentPlugin.setup?.(mockConfig, amplitude);
      const enrichedEvent = await uaParserEnrichmentPlugin.execute?.(event);

      expect(executeSpy).toHaveBeenCalledWith(event);
      expect(enrichedEvent).toHaveProperty('os_name');
      expect(enrichedEvent).toHaveProperty('os_version');
      expect(enrichedEvent).toHaveProperty('os_name');
      expect(enrichedEvent).toHaveProperty('device_model');
    });

    test('should escape the optOut devices info with disabled options 1', async () => {
      const amplitude = createInstance();

      const uaParserEnrichmentPlugin = uaParserPlugin({
        osVersion: false,
      });

      await uaParserEnrichmentPlugin.setup?.(mockConfig, amplitude);

      const enrichedEvent = await uaParserEnrichmentPlugin.execute?.(event);

      expect(enrichedEvent).toHaveProperty('device_model');
      expect(enrichedEvent).toHaveProperty('os_name');
      expect(enrichedEvent).not.toHaveProperty('os_version');
      expect(enrichedEvent).toHaveProperty('device_manufacturer');
    });

    test('should escape the optOut devices info with disabled options 2', async () => {
      const amplitude = createInstance();

      const uaParserEnrichmentPlugin = uaParserPlugin({
        osName: false,
        deviceManufacturer: false,
      });

      await uaParserEnrichmentPlugin.setup?.(mockConfig, amplitude);

      const enrichedEvent = await uaParserEnrichmentPlugin.execute?.(event);

      expect(enrichedEvent).toHaveProperty('device_model');
      expect(enrichedEvent).not.toHaveProperty('os_name');
      expect(enrichedEvent).toHaveProperty('os_version');
      expect(enrichedEvent).not.toHaveProperty('device_manufacturer');
    });

    test('should overwrite the opted in devices info', async () => {
      const amplitude = createInstance();

      const uaParserEnrichmentPlugin = uaParserPlugin({
        osName: true,
        osVersion: true,
        deviceManufacturer: false,
        deviceModel: false,
      });

      await uaParserEnrichmentPlugin.setup?.(mockConfig, amplitude);

      const enrichedEvent = await uaParserEnrichmentPlugin.execute?.(event);

      expect(enrichedEvent).toHaveProperty('os_name');
      expect(enrichedEvent).toHaveProperty('os_version');

      expect(enrichedEvent).not.toHaveProperty('device_manufacturer');
      expect(enrichedEvent).not.toHaveProperty('device_model');
    });
  });
});
