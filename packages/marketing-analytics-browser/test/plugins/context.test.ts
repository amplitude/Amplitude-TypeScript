import { Context } from '../../src/plugins/context';

describe('context', () => {
  describe('execute', () => {
    test('should execute plugin', async () => {
      const context = new Context();
      await context.setup();

      const event = {
        event_type: 'event_type',
      };
      const contextEvent = await context.execute(event);
      expect(contextEvent.library).toBeDefined();
    });
  });
});
