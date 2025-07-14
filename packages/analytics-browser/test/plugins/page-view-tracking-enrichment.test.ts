import { pageViewTrackingEnrichment } from './page-view-tracking-enrichment';

describe('page-view-tracking-enrichment', () => {
  describe('execute', () => {
    test('should enrich page view event', async () => {
      const mockEvent = {
        event_type: '[Amplitude] Page Viewed',
      };
      const plugin = pageViewTrackingEnrichment();
      const result = await plugin.execute?.(mockEvent);
      expect(result).toEqual({
        event_type: '[Amplitude] Page Viewed',
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
      const result = await plugin.execute?.(mockEvent);
      expect(result).toEqual({
        event_type: 'Not Page View',
      });
    });
  });
});
