import { createConfigurationMock } from '../helpers/mock';
import { defaultPageViewEventEnrichment } from '../../src/plugins/default-page-view-event-enrichment';

describe('defaultPageViewEventEnrichment', () => {
  describe('setup', () => {
    test('should return undefined', async () => {
      const plugin = defaultPageViewEventEnrichment();
      expect(await plugin.setup(createConfigurationMock())).toBe(undefined);
    });
  });

  describe('execute', () => {
    test('should return enriched page view event', async () => {
      const event = {
        event_type: '[Amplitude] Page Viewed',
        event_properties: {
          utm_campaign: 'google',
          utm_id: '123',
          page_domain: 'amplitude.com',
          page_location: 'https://amplitude.com/',
          page_path: '/',
          page_title: 'Amplitude',
          page_url: 'https://amplitude.com/',
        },
      };
      const plugin = defaultPageViewEventEnrichment();
      expect(await plugin.execute(event)).toEqual({
        event_type: '[Amplitude] Page Viewed',
        event_properties: {
          utm_campaign: 'google',
          utm_id: '123',
          '[Amplitude] Page Domain': 'amplitude.com',
          '[Amplitude] Page Location': 'https://amplitude.com/',
          '[Amplitude] Page Path': '/',
          '[Amplitude] Page Title': 'Amplitude',
          '[Amplitude] Page URL': 'https://amplitude.com/',
        },
      });
    });

    test('should handle no event properties', async () => {
      const event = {
        event_type: '[Amplitude] Page Viewed',
      };
      const plugin = defaultPageViewEventEnrichment();
      expect(await plugin.execute(event)).toEqual({
        event_type: '[Amplitude] Page Viewed',
      });
    });

    test('should not enrich non-default page view event', async () => {
      const event = {
        event_type: 'Page View',
        event_properties: {
          utm_campaign: 'google',
          utm_id: '123',
          page_domain: 'amplitude.com',
          page_location: 'https://amplitude.com/',
          page_path: '/',
          page_title: 'Amplitude',
          page_url: 'https://amplitude.com/',
        },
      };
      const plugin = defaultPageViewEventEnrichment();
      expect(await plugin.execute(event)).toEqual({
        event_type: 'Page View',
        event_properties: {
          utm_campaign: 'google',
          utm_id: '123',
          page_domain: 'amplitude.com',
          page_location: 'https://amplitude.com/',
          page_path: '/',
          page_title: 'Amplitude',
          page_url: 'https://amplitude.com/',
        },
      });
    });
  });
});
