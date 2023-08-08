import { createInstance } from '@amplitude/analytics-browser';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { pageViewV1EnrichmentPlugin } from '../src/page-view-v1-enrichment';
import { BaseEvent, BrowserConfig, EnrichmentPlugin, LogLevel } from '@amplitude/analytics-types';
import { Logger, UUID } from '@amplitude/analytics-core';

describe('page-view-v1-enrichment', () => {
  let plugin: EnrichmentPlugin;

  const mockConfig: BrowserConfig = {
    apiKey: UUID(),
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
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
    plugin = pageViewV1EnrichmentPlugin();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    test('should overwirte the browser v2 page view keys to v1 page view keys', async () => {
      const event: BaseEvent = {
        event_type: '[Amplitude] Page Viewed',
        event_properties: {
          '[Amplitude] Page Domain': 'page_domain_v2',
          '[Amplitude] Page Path': 'page_path_v2',
          '[Amplitude] Page Title': 'page_title_v2',
          '[Amplitude] Page URL': 'page_url_v2',
          '[Amplitude] Page Location': 'page_location_v2',
        },
        user_properties: {
          org: 'engineer',
        },
      };

      const amplitude = createInstance();

      const executeSpy = jest.spyOn(plugin, 'execute');

      await plugin.setup?.(mockConfig, amplitude);
      const enrichedEvent = await plugin.execute?.(event);

      expect(executeSpy).toHaveBeenCalledWith(event);
      expect(enrichedEvent?.event_type).toEqual('Page View');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_domain');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_location');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_path');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_title');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_url');
      expect(enrichedEvent?.event_properties).toEqual({
        page_domain: 'page_domain_v2',
        page_location: 'page_location_v2',
        page_path: 'page_path_v2',
        page_title: 'page_title_v2',
        page_url: 'page_url_v2',
      });

      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Domain');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Location');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Path');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Title');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page URL');

      expect(enrichedEvent?.user_properties).toEqual({
        org: 'engineer',
      });
    });

    test('should not throw error with imcomplete browser v2 page view', async () => {
      const event = {
        event_type: '[Amplitude] Page Viewed',
      };

      const amplitude = createInstance();

      const executeSpy = jest.spyOn(plugin, 'execute');

      await plugin.setup?.(mockConfig, amplitude);
      const enrichedEvent = await plugin.execute?.(event);

      expect(executeSpy).toHaveBeenCalledWith(event);
      expect(enrichedEvent?.event_type).toEqual('Page View');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_domain');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_path');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_title');
      expect(enrichedEvent?.event_properties).toHaveProperty('page_url');

      expect(enrichedEvent?.event_properties).toEqual({
        page_domain: '',
        page_location: '',
        page_path: '',
        page_title: '',
        page_url: '',
      });

      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Domain');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Location');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Path');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page Title');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('[Amplitude] Page URL');
    });

    test('should not overwirte with no page view event', async () => {
      const event = {
        event_type: 'event_type',
        event_properties: {},
      };

      const amplitude = createInstance();

      const executeSpy = jest.spyOn(plugin, 'execute');

      await plugin.setup?.(mockConfig, amplitude);
      const enrichedEvent = await plugin.execute?.(event);

      expect(executeSpy).toHaveBeenCalledWith(event);
      expect(enrichedEvent?.event_type).toEqual('event_type');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('page_domain');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('page_path');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('page_title');
      expect(enrichedEvent?.event_properties).not.toHaveProperty('page_url');
    });
  });
});
