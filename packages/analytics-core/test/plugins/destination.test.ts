import { Destination, getResponseBodyString } from '../../src/plugins/destination';
import { Config, DestinationContext, Logger, Payload, Status } from '@amplitude/analytics-types';
import { API_KEY, useDefaultConfig } from '../helpers/default';
import {
  INVALID_API_KEY,
  SUCCESS_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../../src/messages';
import { uuidPattern } from '../helpers/util';
//import { UUID } from '../../src/utils/uuid';

const jsons = (obj: any) => JSON.stringify(obj, null, 2);
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
      const event = {
        event_type: 'event_type',
      };
      const expectedEvent = {
        event_type: 'event_type',
        insert_id: uuid,
      };
      const addToQueue = jest.spyOn(destination, 'addToQueue').mockImplementation((context: DestinationContext) => {
        context.callback({ event, code: 200, message: Status.Success });
      });
      await destination.execute(event);
      expect(event).toEqual(expectedEvent);
      expect(addToQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('addToQueue', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('should add to queue and schedule a flush', () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        flushIntervalMillis: 0,
      };
      const flush = jest.spyOn(destination, 'flush');
      const event = {
        event_type: 'event_type',
      };
      const context = {
        event,
        callback: () => undefined,
        attempts: 0,
      };
      destination.addToQueue(context);
      jest.runAllTimers();

      expect(flush).toHaveBeenCalledTimes(1);
      expect(context.attempts).toBe(1);
    });

    test('should add to queue and schedule timeout flush', () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        flushIntervalMillis: 1,
      };
      const flush = jest.spyOn(destination, 'flush');
      const event = {
        event_type: 'event_type',
      };
      const context = {
        event,
        callback: () => undefined,
        attempts: 0,
      };
      destination.addToQueue(context);

      jest.runAllTimers();

      expect(flush).toHaveBeenCalledTimes(1);
      expect(context.attempts).toBe(1);
    });
  });

  describe('schedule', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /*     test('should schedule a flush', async () => {
      const destination = new Destination();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (destination as any).scheduled = false;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
        },
      ];
      destination.config = {
        ...destination.config,
        offline: false,
        flushIntervalMillis: 0,
      };
      const flush = jest
        .spyOn(destination, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (destination as any).scheduled = false;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      destination.sendEventIfReady();
      // exhause first setTimeout
      jest.runAllTimers();
      // wait for next tick to call nested setTimeout
      await Promise.resolve();
      // exhause nested setTimeout
      jest.runAllTimers();
      expect(flush).toHaveBeenCalledTimes(2);
    });*/

    test('should not schedule a flush if offline', async () => {
      const destination = new Destination();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (destination as any).scheduled = false;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
        },
      ];
      destination.config = {
        ...destination.config,
        offline: true,
        flushIntervalMillis: 0,
      };
      const flush = jest
        .spyOn(destination, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (destination as any).scheduled = false;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      destination.sendEventIfReady();
      // exhause first setTimeout
      jest.runAllTimers();
      // wait for next tick to call nested setTimeout
      await Promise.resolve();
      // exhause nested setTimeout
      jest.runAllTimers();
      expect(flush).toHaveBeenCalledTimes(0);
    });

    test('should not schedule if one is already in progress', () => {
      const destination = new Destination();
      destination.config = {
        ...destination.config,
        flushIntervalMillis: 0,
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (destination as any).scheduled = true;
      const flush = jest.spyOn(destination, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
      destination.sendEventIfReady();
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
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      await destination.flush();
      expect(send).toHaveBeenCalledTimes(0);
      expect(loggerProvider.debug).toHaveBeenCalledTimes(1);
      expect(loggerProvider.debug).toHaveBeenCalledWith('Skipping flush while offline.');
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
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush();
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
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
      //destination.retryTimeout = 10;
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
      //destination.retryTimeout = 10;
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
      // destination.retryTimeout = 10;
      //destination.throttleTimeout = 1;
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
      //destination.retryTimeout = 10;
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

    test('should handle retry for 503 error', async () => {
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
            return Promise.resolve({
              statusCode: 500,
              status: Status.Failed,
            });
          });
      }
      const transportProvider = new Http();
      const destination = new Destination();
      //destination.retryTimeout = 10;
      const config = {
        ...useDefaultConfig(),
        flushMaxRetries: 1,
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
      expect(results[0].code).toBe(500);
      expect(results[1].code).toBe(500);
      expect(destination.queue.length).toBe(0);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('logging', () => {
    const getMockLogger = (): Logger => ({
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
    });

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

      const config: Config = {
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
            .mockImplementationOnce(() => {
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
        const eventCount = 1;

        const config = {
          ...useDefaultConfig(),
          flushQueueSize: eventCount,
          flushIntervalMillis: 1,
          transportProvider,
          loggerProvider,
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

        expect(transportProvider.send).toHaveBeenCalledTimes(eventCount + 1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(loggerProvider.warn).toHaveBeenCalledTimes(eventCount);
        // eslint-disable-next-line @typescript-eslint/unbound-method,@typescript-eslint/restrict-template-expressions
        expect(loggerProvider.warn).toHaveBeenCalledWith(jsons(response.body));
      },
    );

    /*  THIS SHOULD BE FIX
    test('should log immidiate response body for retries of 413 payload_to_large', async ()=>{
      const uuid: string = expect.stringMatching(uuidPattern) as string;

      const { statusCode, status, body } = {
        statusCode: 413,
        status: Status.PayloadTooLarge,
        body: {
          code: 413,
          error: 'error',
        },
      };
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
          .mockImplementationOnce(() => {
            return Promise.resolve({
              status: Status.Success,
              statusCode: 200,
              body: {
                message: SUCCESS_MESSAGE,
              },
            });
          })
          .mockImplementationOnce(() => {
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
      const eventCount = 2;

      const config = {
        ...useDefaultConfig(),
        flushQueueSize: eventCount,
        flushIntervalMillis: 1,
        transportProvider,
        loggerProvider,
      };
      await destination.setup(config);
      const event = {
        event_type: 'event_type',
        insert_id: uuid,
      };

      const result =  await new Promise((resolve) => {
        const context: DestinationContext = {
          event: {...event, insert_id: UUID()},
          attempts: 0,
          callback: (result: Result) => resolve(result),
        };

        const context2: DestinationContext = {
          event: {...event, insert_id: UUID()},
          attempts: 0,
          callback: (result: Result) => resolve(result),
        };
        void destination.addToQueue(context, context2);
      });

      expect(result).toEqual({
        event,
        message: SUCCESS_MESSAGE,
        code: 200,
      });

      expect(transportProvider.send).toHaveBeenCalledTimes(eventCount + 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(loggerProvider.warn).toHaveBeenCalledTimes(eventCount);
      // eslint-disable-next-line @typescript-eslint/unbound-method,@typescript-eslint/restrict-template-expressions
      expect(loggerProvider.warn).toHaveBeenCalledWith(jsons(response.body));

    })
*/

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
