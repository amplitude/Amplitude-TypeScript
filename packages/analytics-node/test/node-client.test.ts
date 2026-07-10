import { AmplitudeNode } from '../src/node-client';
import * as core from '@amplitude/analytics-core';
import { EnrichmentPlugin, Event, Status } from '@amplitude/analytics-core';
import * as Config from '../src/config';

describe('node-client', () => {
  const API_KEY = 'API_KEY';

  describe('init', () => {
    test('should return config', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
      }).promise;
      expect(client.config).toBeDefined();
    });

    test('should initialize without error when apiKey is undefined', async () => {
      const client = new AmplitudeNode();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await client.init(undefined as any, {
        flushIntervalMillis: 1000,
      }).promise;
      expect(client.config).toBeDefined();
    });

    test('should call prevent concurrent init executions', async () => {
      const client = new AmplitudeNode();
      const useNodeConfig = jest.spyOn(Config, 'useNodeConfig');
      await Promise.all([client.init(API_KEY), client.init(API_KEY), client.init(API_KEY)]);
      // NOTE: `useNodeConfig` is only called once despite multiple init calls
      expect(useNodeConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('add', () => {
    test('should register enrichment plugin added immediately after init without awaiting', async () => {
      const send = jest.fn().mockResolvedValue({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const client = new AmplitudeNode();
      const setup = jest.fn().mockResolvedValue(undefined);
      const execute = jest.fn().mockImplementation((event: Event) =>
        Promise.resolve({
          ...event,
          event_properties: {
            ...event.event_properties,
            source: 'my-app',
          },
        }),
      );
      const plugin: EnrichmentPlugin = {
        name: 'my-plugin',
        type: 'enrichment',
        setup,
        execute,
      };

      // Mirrors: init('API_KEY'); add(new MyPlugin()); track('test event');
      // add() runs in the same sync turn as init()'s return, after q is flushed but
      // before isReady is set — so the plugin is queued and then silently dropped.
      const initPromise = client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
      }).promise;
      Promise.resolve().then(() => client.add(plugin));
      await client.track('test event').promise;
      await initPromise;

      expect(setup).toHaveBeenCalled();
      expect(execute).toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('setOptOut', () => {
    test('should set opt out', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY).promise;
      client.setOptOut(true);
      expect(client.config.optOut).toBe(true);
    });
  });

  describe('identify', () => {
    test('should track identify', async () => {
      const send = jest.fn().mockReturnValueOnce({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const client = new AmplitudeNode();
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
      }).promise;
      const identifyObject = new core.Identify();
      const result = await client.identify(identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('groupIdentify', () => {
    test('should track group identify', async () => {
      const send = jest.fn().mockReturnValueOnce({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const client = new AmplitudeNode();
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
      }).promise;
      const identifyObject = new core.Identify();
      const result = await client.groupIdentify('g', '1', identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('revenue', () => {
    test('should track revenue', async () => {
      const send = jest.fn().mockReturnValueOnce({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const client = new AmplitudeNode();
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
      }).promise;
      const revenueObject = new core.Revenue();
      const result = await client.revenue(revenueObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
