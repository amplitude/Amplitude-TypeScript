import { Context } from '../../src/plugins/context';
import { useDefaultConfig } from '@amplitude/analytics-core/test/helpers/default';

describe('context', () => {
  describe('setup', () => {
    test('should setup plugin', async () => {
      const context = new Context('name');
      const config = useDefaultConfig();
      config.version = '1.0.0';
      await context.setup(config);
      expect(context.appVersion).toBeDefined();
      expect(context.eventId).toBeDefined();
      expect(context.uaResult).toBeDefined();
    });
  });

  describe('execute', () => {
    test('should execute plugin', async () => {
      const context = new Context('name');
      const config = useDefaultConfig();
      config.version = '1.0.0';
      await context.setup(config);

      const event = {
        event_type: 'event_type',
      };
      const firstContextEvent = await context.execute(event);
      expect(firstContextEvent.app_version).toEqual('1.0.0');
      expect(firstContextEvent.event_id).toEqual(0);
      expect(firstContextEvent.event_type).toEqual('event_type');
      expect(firstContextEvent.insert_id).toBeDefined();

      const secondContextEvent = await context.execute(event);
      expect(secondContextEvent.event_id).toEqual(1);
    });
  });
});
