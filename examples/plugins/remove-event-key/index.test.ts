import { removeEventKeyEnrichment } from './';

describe('remove-event-key-enrichment', () => {
  describe('execute', () => {
    test('should remove keys from event payload', async () => {
      const plugin = removeEventKeyEnrichment(['time']);
      const mockEvent = {
        event_type: 'Custom Event',
        time: Date.now(),
      };
      const result = await plugin.execute?.(mockEvent);
      expect(result?.time).toBeUndefined();
    });

    test('should not remove keys from event payload', async () => {
      const plugin = removeEventKeyEnrichment();
      const mockEvent = {
        event_type: 'Custom Event',
        time: Date.now(),
      };
      const result = await plugin.execute?.(mockEvent);
      expect(result?.time).toBeDefined();
    });
  });
});
