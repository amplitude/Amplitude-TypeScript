import { pageViewTrackingEnrichment } from './';

describe('page-view-tracking-enrichment', () => {
  describe('execute', () => {
    test('should enrich page view event', async () => {
      const mockEvent = {
        event_type: 'Page View',
      };
      const plugin = pageViewTrackingEnrichment();
      const result = await plugin.execute?.(mockEvent);
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
      const result = await plugin.execute?.(mockEvent);
      expect(result).toEqual({
        event_type: 'Not Page View',
      });
    });
  });
});
