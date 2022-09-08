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

    test('should be overwritten by the context', async () => {
      const sourceName = 'ampli';
      const sourceVersion = '2.0.0';
      const context = new Context();
      const config = useDefaultConfig({
        ingestionMetadata: {
          sourceName,
          sourceVersion,
        },
      });
      await context.setup(config);

      const event = {
        event_type: 'event_type',
        device_id: 'new deviceId',
        session_id: 1,
        user_id: 'user@amplitude.com',
      };
      const firstContextEvent = await context.execute(event);
      expect(firstContextEvent.event_id).toEqual(0);
      expect(firstContextEvent.insert_id).toBeDefined();
      expect(firstContextEvent.event_type).toEqual('event_type');
      expect(firstContextEvent.device_id).toEqual('new deviceId');
      expect(firstContextEvent.session_id).toEqual(1);
      expect(firstContextEvent.user_id).toEqual('user@amplitude.com');
      expect(firstContextEvent.ingestion_metadata?.source_name).toEqual(sourceName);
      expect(firstContextEvent.ingestion_metadata?.source_version).toEqual(sourceVersion);

      const secondContextEvent = await context.execute(event);
      expect(secondContextEvent.event_id).toEqual(1);
    });

    describe('ingestionMetadata config', () => {
      test('sourceName should be optional', async () => {
        const sourceVersion = '2.0.0';
        const context = new Context();
        const config = useDefaultConfig({
          ingestionMetadata: {
            sourceVersion,
          },
        });
        await context.setup(config);

        const event = {
          event_type: 'event_type',
        };
        const firstContextEvent = await context.execute(event);
        expect(firstContextEvent.event_id).toEqual(0);
        expect(firstContextEvent.ingestion_metadata?.source_name).toBeUndefined();
        expect(firstContextEvent.ingestion_metadata?.source_version).toEqual(sourceVersion);
      });

      test('sourceVersion should be optional', async () => {
        const sourceName = 'ampli';
        const context = new Context();
        const config = useDefaultConfig({
          ingestionMetadata: {
            sourceName,
          },
        });
        await context.setup(config);

        const event = {
          event_type: 'event_type',
        };
        const firstContextEvent = await context.execute(event);
        expect(firstContextEvent.event_id).toEqual(0);
        expect(firstContextEvent.ingestion_metadata?.source_name).toEqual(sourceName);
        expect(firstContextEvent.ingestion_metadata?.source_version).toBeUndefined();
      });
    });
  });
});
