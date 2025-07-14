import { Destination, getResponseBodyString, Context } from '../../src/plugins/destination';
import { IConfig } from '../../src/types/config/core';
import { ILogger } from '../../src/logger';
import { Payload } from '../../src/types/payload';
import { Status } from '../../src/types/status';
import { API_KEY, useDefaultConfig } from '../helpers/default';
import {
  INVALID_API_KEY,
  MISSING_API_KEY_MESSAGE,
  SUCCESS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../../src/types/messages';
import { uuidPattern } from '../helpers/util';
import { RequestMetadata } from '../../src';
import { TrackEvent } from '../../src/types/event/event';

const jsons = (obj: any) => JSON.stringify(obj, null, 2);

const getMockLogger = (): ILogger => ({
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
});

describe('destination', () => {
  describe('setup', () => {
    test('should setup plugin', async () => {
      const destination = new Destination();
      const config = useDefaultConfig();
      config.serverUrl = 'url';
      config.flushMaxRetries = 0;
      config.flushQueueSize = 0;
      config.flushIntervalMillis = 0;
      await destination.setup(config);
      expect(destination.config.transportProvider).toBeDefined();
      expect(destination.config.serverUrl).toBe('url');
      expect(destination.config.flushMaxRetries).toBe(0);
      expect(destination.config.flushQueueSize).toBe(0);
      expect(destination.config.flushIntervalMillis).toBe(0);
    });

    test('should read from storage', async () => {
      const destination = new Destination();
      const config = useDefaultConfig();
      const event = {
        event_type: 'hello',
      };
      config.storageProvider = {
        isEnabled: async () => true,
        get: async () => undefined,
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
        getRaw: async () => undefined,
      };
      const get = jest.spyOn(config.storageProvider, 'get').mockResolvedValueOnce([event]);
      const execute = jest.spyOn(destination, 'execute').mockReturnValueOnce(
        Promise.resolve({
          event,
          message: Status.Success,
          code: 200,
        }),
      );
      await destination.setup(config);
      expect(get).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    test('should be ok with undefined storage', async () => {
      const destination = new Destination();
      const config = useDefaultConfig();
      config.storageProvider = undefined;
      const execute = jest.spyOn(destination, 'execute');
      await destination.setup(config);
      expect(execute).toHaveBeenCalledTimes(0);
    });
  });

  describe('execute', () => {
    test('should execute plugin', async () => {
      const uuid: string = expect.stringMatching(uuidPattern) as string;
      const destination = new Destination();
      destination.config = useDefaultConfig();
      const event = {
        event_type: 'event_type',
      };
      const expectedEvent = {
        event_type: 'event_type',
        insert_id: uuid,
      };
      const schedule = jest.spyOn(destination, 'schedule').mockImplementation(jest.fn);
      const saveEvents = jest.spyOn(destination, 'saveEvents').mockImplementation(jest.fn);

      void destination.execute(event);

      expect(destination.queue.length).toBe(1);
      expect(destination.queue[0].event).toEqual(expectedEvent);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(saveEvents).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeEventsExceedFlushMaxRetries', () => {
    test('should remove events exceed flushMaxRetries', async () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        flushMaxRetries: 3,
      };
      const fulfillRequest = jest.spyOn(destination, 'fulfillRequest').mockImplementation(jest.fn);
      const list = [
        {
          event: { event_type: 'event_1' },
          attempts: 2,
          callback: () => undefined,
          timeout: 0,
        },
        {
          event: { event_type: 'event_2' },
          attempts: 2,
          callback: () => undefined,
          timeout: 0,
        },
        {
          event: { event_type: 'event_3' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      const result = destination.removeEventsExceedFlushMaxRetries(list);
      expect(fulfillRequest).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(1);
      expect(result[0].event.event_type).toBe('event_3');
    });
  });

  describe('schedule', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should schedule a flush when no one scheduled', async () => {
      const destination = new Destination();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (destination as any).scheduled = null;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      destination.config = {
        ...destination.config,
        offline: false,
      };
      const flush = jest
        .spyOn(destination, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (destination as any).scheduled = null;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      destination.schedule(1000);
      // exhause setTimeout
      jest.runAllTimers();
      expect(flush).toHaveBeenCalledTimes(1);
    });

    test.each([
      [1, 0],
      [3, 1],
    ])('should schedule a flush based on timeout', async (timeout, flushCalledTimes) => {
      const destination = new Destination();
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      destination.scheduleId = setTimeout(() => {}, 2);
      destination.scheduledTimeout = 2;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      destination.config = {
        ...destination.config,
        offline: false,
      };
      const flush = jest
        .spyOn(destination, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (destination as any).scheduled = null;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      destination.schedule(timeout);
      // exhause setTimeout
      jest.runAllTimers();
      expect(flush).toHaveBeenCalledTimes(flushCalledTimes);
    });

    test('should not schedule a flush if offline', async () => {
      const destination = new Destination();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (destination as any).scheduled = null;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      destination.config = {
        ...destination.config,
        offline: true,
      };
      const flush = jest
        .spyOn(destination, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (destination as any).scheduled = null;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      destination.schedule(0);
      // exhause first setTimeout
      jest.runAllTimers();
      // wait for next tick to call nested setTimeout
      await Promise.resolve();
      // exhause nested setTimeout
      jest.runAllTimers();
      expect(flush).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should skip flush if offline', async () => {
      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };

      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        offline: true,
        loggerProvider: loggerProvider,
      };
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      await destination.flush();
      expect(send).toHaveBeenCalledTimes(0);
      expect(loggerProvider.debug).toHaveBeenCalledTimes(1);
      expect(loggerProvider.debug).toHaveBeenCalledWith('Skipping flush while offline.');
    });

    test('should skip flush if previous one has not resolved', async () => {
      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };

      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        offline: false,
        loggerProvider: loggerProvider,
      };
      destination.flushId = setTimeout(jest.fn, 1);

      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      await destination.flush();
      expect(send).toHaveBeenCalledTimes(0);
      expect(loggerProvider.debug).toHaveBeenCalledTimes(1);
      expect(loggerProvider.debug).toHaveBeenCalledWith('Skipping flush because previous flush has not resolved.');
    });

    test('should get batch and call send', async () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        flushQueueSize: 1,
      };
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush();
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('should send with queue', async () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
      };
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush();
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('should send later', async () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
      };
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          timeout: 1000,
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush();
      expect(destination.queue).toEqual([
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          callback: expect.any(Function),
          timeout: 1000,
        },
      ]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(0);
    });

    test('should send batches in order', async () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        flushQueueSize: 1,
      };

      const context1 = {
        event: { event_type: 'event_type_1' },
        attempts: 0,
        callback: () => undefined,
        timeout: 0,
      };
      const context2 = {
        event: { event_type: 'event_type_2' },
        attempts: 0,
        callback: () => undefined,
        timeout: 0,
      };
      destination.queue = [context1, context2];

      const resolveOrder: number[] = [];
      const send = jest
        .spyOn(destination, 'send')
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                resolveOrder.push(1);
                resolve();
              }, 1000),
            ),
        ) // 1st call resolves in 1 sec
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                resolveOrder.push(2);
                resolve();
              }, 500),
            ),
        ); // 2nd call resolves in 0.5 sec

      const result = await destination.flush();

      expect(result).toBe(undefined);
      expect(send).toHaveBeenNthCalledWith(1, [context1], false);
      expect(send).toHaveBeenNthCalledWith(2, [context2], false);
      expect(send).toHaveBeenCalledTimes(2);
      expect(resolveOrder).toEqual([1, 2]);
    });
  });

  describe('send', () => {
    test('should include client upload time', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const event_upload_time = '2023-01-01T12:00:00:000Z';
      Date.prototype.toISOString = jest.fn().mockReturnValueOnce(event_upload_time);

      const transportProvider = {
        send: jest.fn().mockImplementationOnce((_url: string, payload: Payload) => {
          expect(payload.client_upload_time).toBe(event_upload_time);
          return Promise.resolve({
            status: Status.Success,
            statusCode: 200,
            body: {
              eventsIngested: 1,
              payloadSizeBytes: 1,
              serverUploadTime: 1,
            },
          });
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: API_KEY,
        minIdLength: 10,
      });
      await destination.send([context]);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 200,
        message: SUCCESS_MESSAGE,
      });
    });

    test('should include request metadata', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const request_metadata = new RequestMetadata();
      request_metadata.recordHistogram('remote_config_fetch_time_API_success', 100);

      const transportProvider = {
        send: jest.fn().mockImplementationOnce((_url: string, payload: Payload) => {
          expect(payload.request_metadata).toBe(request_metadata);
          return Promise.resolve({
            status: Status.Success,
            statusCode: 200,
            body: {
              eventsIngested: 1,
              payloadSizeBytes: 1,
              serverUploadTime: 1,
            },
          });
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: API_KEY,
        requestMetadata: request_metadata,
      });
      await destination.send([context]);
      // request metadata should be reset after sending
      expect(destination.config.requestMetadata).toEqual(new RequestMetadata());
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 200,
        message: SUCCESS_MESSAGE,
      });
    });

    test('should include min id length', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce((_url: string, payload: Payload) => {
          expect(payload.options?.min_id_length).toBe(10);
          return Promise.resolve({
            status: Status.Success,
            statusCode: 200,
            body: {
              eventsIngested: 1,
              payloadSizeBytes: 1,
              serverUploadTime: 1,
            },
          });
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: API_KEY,
        minIdLength: 10,
      });
      await destination.send([context]);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 200,
        message: SUCCESS_MESSAGE,
      });
    });

    test('should not include extra', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
        extra: { 'extra-key': 'extra-value' },
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce((_url: string, payload: Payload) => {
          expect(payload.options?.min_id_length).toBe(10);
          expect(payload.events.some((event) => !!event.extra)).toBeFalsy();
          return Promise.resolve({
            status: Status.Success,
            statusCode: 200,
            body: {
              eventsIngested: 1,
              payloadSizeBytes: 1,
              serverUploadTime: 1,
            },
          });
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: API_KEY,
        minIdLength: 10,
      });
      await destination.send([context]);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 200,
        message: SUCCESS_MESSAGE,
      });
    });

    test('should not retry', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce(() => {
          return Promise.resolve({
            status: Status.Failed,
            statusCode: 500,
          });
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: API_KEY,
      });
      await destination.send([context], false);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 500,
        message: Status.Failed,
      });
    });

    test('should provide error details', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const body = {
        error: 'Request missing required field',
        missingField: 'user_id',
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce(() => {
          return Promise.resolve({
            status: Status.Invalid,
            statusCode: 400,
            body,
          });
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: API_KEY,
      });
      await destination.send([context], false);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 400,
        message: `${Status.Invalid}: ${jsons(body)}`,
      });
    });

    test('should handle no api key', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const event = {
        event_type: 'event_type',
      };
      const context = {
        attempts: 0,
        callback,
        event,
        timeout: 0,
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce(() => {
          throw new Error();
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        apiKey: '',
      });
      await destination.send([context]);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        event,
        code: 400,
        message: MISSING_API_KEY_MESSAGE,
      });
    });

    test('should not drop data on unexpected error', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const context = {
        attempts: 0,
        callback,
        event: {
          event_type: 'event_type',
        },
        timeout: 0,
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce(() => {
          throw new Error();
        }),
      };
      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
      });
      await destination.send([context]);
      // We should not fulfill request when the request fails with an unknown error. This should be retried
      expect(callback).toHaveBeenCalledTimes(0);
    });
  });

  describe('updateEventStorage', () => {
    test('should be ok with no storage provider', async () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.storageProvider = undefined;
      expect(destination.saveEvents()).toBe(undefined);
    });

    test('should filter dropped event and update the storage provider', async () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.storageProvider = {
        isEnabled: async () => true,
        get: async () => undefined,
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
        getRaw: async () => undefined,
      };
      const event1 = { event_type: 'event', insert_id: '1' };
      const event2 = { event_type: 'filtered_event', insert_id: '2' };
      const events = [event1, event2];
      const eventsToAdd = events.map((event) => {
        return {
          event,
          attempts: 0,
          callback: () => undefined,
          timeout: 0,
        };
      });
      const set = jest.spyOn(destination.config.storageProvider, 'set').mockResolvedValueOnce(undefined);
      destination.queue = eventsToAdd;
      const eventsToRemove = [eventsToAdd[1]];
      destination.removeEvents(eventsToRemove);
      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith('', expect.objectContaining([event1]));
    });

    test('should save event to the storage provider', async () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.storageProvider = {
        isEnabled: async () => true,
        get: async () => undefined,
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
        getRaw: async () => undefined,
      };
      const event = { event_type: 'event', insert_id: '1' };
      const set = jest.spyOn(destination.config.storageProvider, 'set').mockResolvedValueOnce(undefined);
      const context = {
        event: event,
        attempts: 0,
        callback: () => undefined,
        timeout: 0,
      };
      destination.queue = [context];
      destination.removeEvents([]);
      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith('', expect.objectContaining([event]));
    });
  });

  describe('module level integration', () => {
    const successResponse = {
      status: Status.Success,
      statusCode: 200,
      body: {
        eventsIngested: 1,
        payloadSizeBytes: 1,
        serverUploadTime: 1,
      },
    };

    // timeline:
    //  0       -> event1
    //  1000    -> flush(event1) because of flush interval
    //  1050    -> event2
    //  2050 (1050 + 1000)   -> no flush(event2) because request1 has not resolved
    //  2200(1000 + 1200)    -> request1 resolved, schedule unsent events
    //  3200    -> flush(event2)
    test('should schedule another flush after the previous resolves', async () => {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const testFlushIntervalMillis = 1000;
      let request1Payload: { events: TrackEvent[] } = { events: [{ event_type: 'init' }] };
      let request2Payload: { events: TrackEvent[] } = { events: [{ event_type: 'init' }] };

      class Http {
        send = jest
          .fn()
          .mockImplementationOnce((_, payload: { events: TrackEvent[] }) => {
            // expect() doesn't work here so move it outside
            request1Payload = payload;
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve(successResponse);
              }, 1200);
            });
          })
          .mockImplementationOnce((_, payload: { events: TrackEvent[] }) => {
            // expect() doesn't work here so move it outside
            request2Payload = payload;
            return Promise.resolve(successResponse);
          });
      }

      const transportProvider = new Http();
      const destination = new Destination();
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 3,
        flushIntervalMillis: testFlushIntervalMillis,
        transportProvider,
        loggerProvider: getMockLogger(),
      };

      await destination.setup(config);
      void destination.execute({ event_type: 'event_type_1' });

      await wait(1050);
      void destination.execute({ event_type: 'event_type_2' });

      await wait(2200);

      expect(request1Payload.events.length).toBe(1);
      expect(request1Payload.events[0].event_type).toBe('event_type_1');
      expect(request2Payload.events.length).toBe(1);
      expect(request2Payload.events[0].event_type).toBe('event_type_2');
      expect(transportProvider.send).toHaveBeenCalledTimes(2);
    });

    test('should handle unexpected error', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.resolve(null);
        });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      const result = await destination.execute({
        event_type: 'event_type',
      });
      expect(result.code).toBe(0);
      expect(result.message).toBe(UNEXPECTED_ERROR_MESSAGE);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test('should not retry with invalid api key', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.resolve({
            status: Status.Invalid,
            statusCode: 400,
            body: {
              error: INVALID_API_KEY,
            },
          });
        });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      destination.retryTimeout = 10;
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      const results = await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(results[0].code).toBe(400);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test('should handle retry for 400 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.resolve({
              status: Status.Invalid,
              statusCode: 400,
              body: {
                error: 'error',
                missingField: '',
                eventsWithInvalidFields: { a: [0] },
                eventsWithMissingFields: { b: [] },
                eventsWithInvalidIdLengths: {},
                silencedEvents: [],
              },
            });
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      destination.retryTimeout = 10;
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      const results = await Promise.all([
        destination.execute({
          event_type: 'event_type',
          insert_id: '0',
        }),
        destination.execute({
          event_type: 'event_type',
          insert_id: '1',
        }),
      ]);
      expect(results[0].code).toBe(400);
      expect(results[1].code).toBe(200);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(2);
    });

    test('should handle retry for 400 error with missing body field', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.resolve({
            status: Status.Invalid,
            statusCode: 400,
            body: {
              error: 'error',
              missingField: 'key',
              eventsWithInvalidFields: {},
              eventsWithMissingFields: {},
              silencedEvents: [],
            },
          });
        });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      const results = await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(results[0].code).toBe(400);
      expect(results[1].code).toBe(400);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test('should handle retry for 413 error with flushQueueSize of 1', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.resolve({
            status: Status.PayloadTooLarge,
            statusCode: 413,
            body: {
              error: 'error',
            },
          });
        });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 1,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      const event = {
        event_type: 'event_type',
      };
      const result = await destination.execute(event);
      expect(result).toEqual({
        event,
        message: 'error',
        code: 413,
      });
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test('should handle retry for 413 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.resolve({
              status: Status.PayloadTooLarge,
              statusCode: 413,
              body: {
                error: 'error',
              },
            });
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      destination.retryTimeout = 10;
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(3);
    });

    test('should handle retry for 429 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.resolve({
              status: Status.RateLimit,
              statusCode: 429,
              body: {
                error: 'error',
                epsThreshold: 1,
                throttledDevices: {},
                throttledUsers: {},
                exceededDailyQuotaDevices: {
                  '1': 1,
                },
                exceededDailyQuotaUsers: {
                  '2': 1,
                },
                throttledEvents: [0],
              },
            });
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      destination.retryTimeout = 10;
      destination.throttleTimeout = 1;
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 4,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      const results = await Promise.all([
        // throttled
        destination.execute({
          event_type: 'event_type',
          user_id: '0',
          device_id: '0',
          insert_id: '0',
        }),
        // exceed daily device quota
        destination.execute({
          event_type: 'event_type',
          user_id: '1',
          device_id: '1',
          insert_id: '1',
        }),
        // exceed daily user quota
        destination.execute({
          event_type: 'event_type',
          user_id: '2',
          device_id: '2',
          insert_id: '2',
        }),
        // success
        destination.execute({
          event_type: 'event_type',
          user_id: '3',
          device_id: '3',
          insert_id: '3',
        }),
      ]);
      expect(results[0].code).toBe(200);
      expect(results[1].code).toBe(429);
      expect(results[2].code).toBe(429);
      expect(results[3].code).toBe(200);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(2);
    });

    test('should handle retry for 500 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.resolve({
              statusCode: 500,
              status: Status.Failed,
            });
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      destination.retryTimeout = 10;
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('logging', () => {
    test('should handle null loggerProvider', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.resolve({
            status: Status.Success,
            statusCode: 200,
            body: {
              message: 'success',
            },
          });
        });
      }

      const transportProvider = new Http();
      const destination = new Destination();

      const config: IConfig = {
        ...useDefaultConfig(),
        flushQueueSize: 1,
        flushIntervalMillis: 1,
        transportProvider,
      };
      await destination.setup(config);
      const event = {
        event_type: 'event_type',
      };
      const result = await destination.execute(event);
      expect(result).toEqual({
        event,
        message: SUCCESS_MESSAGE,
        code: 200,
      });
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test.each([
      {
        statusCode: 400,
        status: Status.Invalid,
        body: {
          code: 400,
          error: 'error',
          missingField: undefined,
          eventsWithInvalidFields: {},
          eventsWithMissingFields: {},
          eventsWithInvalidIdLengths: {},
          silencedEvents: [],
        },
      },
      {
        statusCode: 413,
        status: Status.PayloadTooLarge,
        body: {
          code: 413,
          error: 'error',
        },
      },
      {
        statusCode: 429,
        status: Status.RateLimit,
        body: {
          code: 429,
          error: 'error',
          epsThreshold: 1,
          throttledDevices: {},
          throttledUsers: {},
          exceededDailyQuotaDevices: {
            '1': 1,
          },
          exceededDailyQuotaUsers: {
            '2': 1,
          },
          throttledEvents: [0],
        },
      },
    ])(
      'should log intermediate response body for retries of $statusCode $status',
      async ({ statusCode, status, body }) => {
        const response = {
          status,
          statusCode,
          body,
        };

        class Http {
          send = jest
            .fn()
            .mockImplementationOnce(() => {
              return Promise.resolve(response);
            })
            .mockImplementation(() => {
              return Promise.resolve({
                status: Status.Success,
                statusCode: 200,
                body: {
                  message: SUCCESS_MESSAGE,
                },
              });
            });
        }
        const transportProvider = new Http();
        const destination = new Destination();
        const loggerProvider = getMockLogger();
        const eventCount = status === Status.PayloadTooLarge ? 2 : 1;
        const config = {
          ...useDefaultConfig(),
          flushQueueSize: eventCount,
          flushIntervalMillis: 1,
          transportProvider,
          loggerProvider,
        };
        await destination.setup(config);
        destination.retryTimeout = 10;
        destination.throttleTimeout = 10;
        const event = {
          event_type: 'event_type',
        };
        let result;
        if (eventCount > 1) {
          // Need 2 events for 413 to retry, send them both at the same time
          const context: Context = {
            event,
            attempts: 0,
            callback: jest.fn(),
            timeout: 0,
          };
          destination.queue.push(context);
          result = await destination.execute(event);
        } else {
          result = await destination.execute(event);
        }

        expect(result).toEqual({
          event,
          message: SUCCESS_MESSAGE,
          code: 200,
        });

        expect(transportProvider.send).toHaveBeenCalledTimes(status === Status.PayloadTooLarge ? 3 : 2);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method,@typescript-eslint/restrict-template-expressions
        expect(loggerProvider.warn).toHaveBeenCalledWith(jsons(response.body));
      },
    );

    test.each([
      { err: new Error('Error'), message: 'Error' },
      { err: 'string error', message: 'string error' },
    ])('should log unexpected error "$message"', async ({ err, message }) => {
      const destination = new Destination();
      const callback = jest.fn();
      const context = {
        attempts: 0,
        callback,
        event: {
          event_type: 'event_type',
        },
        timeout: 0,
      };
      const transportProvider = {
        send: jest.fn().mockImplementationOnce(() => {
          throw err;
        }),
      };
      const loggerProvider = getMockLogger();

      await destination.setup({
        ...useDefaultConfig(),
        transportProvider,
        loggerProvider,
      });
      await destination.send([context]);
      // Callback should not be called since errors get retried
      expect(callback).toHaveBeenCalledTimes(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(loggerProvider.error).toHaveBeenCalledWith(message);
    });

    test('should parse response without body', async () => {
      const result = getResponseBodyString({
        status: Status.Unknown,
        statusCode: 700,
      });
      expect(result).toBe('');
    });
  });
});
