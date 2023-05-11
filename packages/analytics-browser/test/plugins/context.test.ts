import { Context } from '../../src/plugins/context';
import { useDefaultConfig } from '../helpers/default';

describe('context', () => {
  describe('setup', () => {
    test('should setup plugin', async () => {
      const context = new Context();
      const config = useDefaultConfig();
      config.appVersion = '1.0.0';
      config.lastEventId = 1;
      await context.setup(config);
      expect(context.config.appVersion).toEqual('1.0.0');
      expect(context.eventId).toEqual(2);
    });

    test('should setup plugin without app version', async () => {
      const context = new Context();
      const config = useDefaultConfig();
      await context.setup(config);
      expect(context.config.appVersion).toBeUndefined();
      expect(context.eventId).toEqual(0);
    });
  });

  describe('execute', () => {
    test('should execute plugin', async () => {
      const context = new Context();
      const config = useDefaultConfig({
        deviceId: 'deviceId',
        sessionId: 1,
        userId: 'user@amplitude.com',
      });
      config.appVersion = '1.0.0';
      await context.setup(config);

      const event = {
        event_type: 'event_type',
      };
      const firstContextEvent = await context.execute(event);
      expect(firstContextEvent.app_version).toEqual('1.0.0');
      expect(firstContextEvent.event_id).toEqual(0);
      expect(firstContextEvent.event_type).toEqual('event_type');
      expect(firstContextEvent.insert_id).toBeDefined();
      expect(firstContextEvent.platform).toEqual('Web');
      expect(firstContextEvent.language).toBeDefined();
      expect(firstContextEvent.ip).toEqual('$remote');
      expect(firstContextEvent.device_id).toEqual('deviceId');
      expect(firstContextEvent.session_id).toEqual(1);
      expect(firstContextEvent.user_id).toEqual('user@amplitude.com');

      const secondContextEvent = await context.execute(event);
      expect(secondContextEvent.event_id).toEqual(1);
    });

    test('should not return the properties when the tracking options are false', async () => {
      const context = new Context();
      const config = useDefaultConfig({
        deviceId: 'deviceId',
        sessionId: 1,
        trackingOptions: {
          ipAddress: false,
          language: false,
          platform: false,
        },
        userId: 'user@amplitude.com',
      });
      config.appVersion = '1.0.0';
      await context.setup(config);

      const event = {
        event_type: 'event_type',
      };
      const firstContextEvent = await context.execute(event);
      expect(firstContextEvent.app_version).toEqual('1.0.0');
      expect(firstContextEvent.event_id).toEqual(0);
      expect(firstContextEvent.event_type).toEqual('event_type');
      expect(firstContextEvent.insert_id).toBeDefined();

      // tracking options should not be included
      expect(firstContextEvent.platform).toBeUndefined();
      expect(firstContextEvent.language).toBeUndefined();
      expect(firstContextEvent.ip).toBeUndefined();
      expect(firstContextEvent.device_id).toEqual('deviceId');
      expect(firstContextEvent.session_id).toEqual(1);
      expect(firstContextEvent.user_id).toEqual('user@amplitude.com');

      const secondContextEvent = await context.execute(event);
      expect(secondContextEvent.event_id).toEqual(1);
    });

    test('should be overwritten by the context', async () => {
      const context = new Context();
      const config = useDefaultConfig({
        deviceId: 'deviceId',
        sessionId: 1,
        userId: 'user@amplitude.com',
      });
      config.appVersion = '1.0.0';
      await context.setup(config);

      const event = {
        event_type: 'event_type',
        device_id: 'new deviceId',
      };
      const firstContextEvent = await context.execute(event);
      expect(firstContextEvent.app_version).toEqual('1.0.0');
      expect(firstContextEvent.event_id).toEqual(0);
      expect(firstContextEvent.event_type).toEqual('event_type');
      expect(firstContextEvent.insert_id).toBeDefined();
      expect(firstContextEvent.device_id).toEqual('new deviceId');

      const secondContextEvent = await context.execute(event);
      expect(secondContextEvent.event_id).toEqual(1);
    });

    describe('ingestionMetadata config', () => {
      test('should include ingestion metadata', async () => {
        const sourceName = 'ampli';
        const sourceVersion = '2.0.0';
        const context = new Context();
        const config = useDefaultConfig({
          ingestionMetadata: {
            sourceName,
            sourceVersion,
          },
          userId: 'user@amplitude.com',
        });
        await context.setup(config);

        const event = {
          event_type: 'event_type',
        };
        const firstContextEvent = await context.execute(event);
        expect(firstContextEvent.event_id).toEqual(0);
        expect(firstContextEvent.event_type).toEqual('event_type');
        expect(firstContextEvent.ingestion_metadata?.source_name).toEqual(sourceName);
        expect(firstContextEvent.ingestion_metadata?.source_version).toEqual(sourceVersion);
      });

      test('sourceName should be optional', async () => {
        const sourceVersion = '2.0.0';
        const context = new Context();
        const config = useDefaultConfig({
          ingestionMetadata: {
            sourceVersion,
          },
          userId: 'user@amplitude.com',
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
          userId: 'user@amplitude.com',
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
