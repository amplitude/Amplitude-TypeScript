import { FetchTransport } from '@amplitude/analytics-client-common';
import { Logger } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { pageViewTrackingEnrichment } from './';

describe('page-view-tracking-enrichment', () => {
  describe('setup', () => {
    test('should return undefined', async () => {
      const mockConfig = {
        apiKey: '',
        flushIntervalMillis: 0,
        flushMaxRetries: 0,
        flushQueueSize: 0,
        logLevel: LogLevel.None,
        loggerProvider: new Logger(),
        optOut: false,
        serverUrl: undefined,
        transportProvider: new FetchTransport(),
        useBatch: false,
      };
      const plugin = pageViewTrackingEnrichment();
      const result = await plugin.setup(mockConfig);
      expect(result).toBeUndefined();
    });
  });

  describe('execute', () => {
    test('should enrich page view event', async () => {
      const mockEvent = {
        event_type: 'Page View',
      };
      const plugin = pageViewTrackingEnrichment();
      const result = await plugin.execute(mockEvent);
      expect(result).toEqual({
        event_type: 'Page View',
        event_properties: {
          new_property: 'new_value',
        },
      });
    });

    test('should not enrich other events', async () => {
      const mockEvent = {
        event_type: 'Not Page View',
      };
      const plugin = pageViewTrackingEnrichment();
      const result = await plugin.execute(mockEvent);
      expect(result).toEqual({
        event_type: 'Not Page View',
      });
    });
  });
});
