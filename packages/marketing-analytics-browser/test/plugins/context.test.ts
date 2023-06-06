import { Config } from '@amplitude/analytics-types';
import { context } from '../../src/plugins/context';
import { createInstance } from '@amplitude/analytics-browser';

describe('context', () => {
  describe('execute', () => {
    test('should execute plugin', async () => {
      const amplitude = createInstance();
      const plugin = context();
      await plugin.setup?.({} as Config, amplitude);

      const e = {
        event_type: 'event_type',
      };
      const event = await plugin.execute?.(e);
      expect(event?.library).toMatch(/^amplitude-ma-ts\/.+/);
    });
  });
});
