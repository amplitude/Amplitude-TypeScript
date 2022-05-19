import { Context } from '../../src/plugins/context';
import { useDefaultConfig } from '../helpers/default';

describe('context', () => {
  describe('setup', () => {
    test('should setup plugin', async () => {
      const context = new Context();
      const config = useDefaultConfig();
      await context.setup(config);
      expect(context.eventId).toEqual(0);
    });

    test('should setup plugin without app version', async () => {
      const context = new Context();
      const config = useDefaultConfig();
      await context.setup(config);
      expect(context.eventId).toEqual(0);
    });
  });

  describe('execute', () => {
    test('should execute plugin', async () => {
      const context = new Context();
      const config = useDefaultConfig();
      await context.setup(config);

      const event = {
        event_type: 'event_type',
        device_id: 'deviceId',
        session_id: 1,
        user_id: 'user@amplitude.com',
      };
      const firstContextEvent = await context.execute(event);
      expect(firstContextEvent.event_id).toEqual(0);
      expect(firstContextEvent.insert_id).toBeDefined();
      expect(firstContextEvent.device_id).toEqual('deviceId');
      expect(firstContextEvent.session_id).toEqual(1);
      expect(firstContextEvent.user_id).toEqual('user@amplitude.com');

      const secondContextEvent = await context.execute(event);
      expect(secondContextEvent.event_id).toEqual(1);
    });
  });
});
