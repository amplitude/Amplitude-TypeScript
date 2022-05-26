import { Destination } from '../../src/plugins/destination';
import { DestinationContext, Payload, Status } from '@amplitude/analytics-types';
import { API_KEY, useDefaultConfig } from '../helpers/default';
import { MISSING_API_KEY_MESSAGE, SUCCESS_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from '../../src/messages';

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
      const get = jest.spyOn(config.storageProvider, 'get').mockReturnValueOnce([event]);
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
  });

  describe('execute', () => {
    test('should execute plugin', async () => {
      const destination = new Destination();
      const event = {
        event_type: 'event_type',
      };
      const addToQueue = jest.spyOn(destination, 'addToQueue').mockImplementation((context: DestinationContext) => {
        context.callback({ event, code: 200, message: Status.Success });
      });
      await destination.execute(event);
      expect(addToQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('addToQueue', () => {
    test('should add to queue and schedule a flush', () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
        flushIntervalMillis: 0,
      };
      const schedule = jest.spyOn(destination, 'schedule').mockReturnValueOnce(undefined);
      const event = {
        event_type: 'event_type',
      };
      const context = {
        event,
        callback: () => undefined,
        attempts: 0,
        delay: 0,
      };
      destination.addToQueue(context);
      expect(schedule).toHaveBeenCalledTimes(1);
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

    test('should schedule a flush', async () => {
      const destination = new Destination();
      destination.scheduled = false;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          delay: 0,
        },
      ];
      const flush = jest
        .spyOn(destination, 'flush')
        .mockReturnValueOnce(Promise.resolve(undefined))
        .mockReturnValueOnce(Promise.resolve(undefined));
      destination.schedule(0);
      // exhause first setTimeout
      jest.runAllTimers();
      // wait for next tick to call nested setTimeout
      await Promise.resolve();
      // exhause nested setTimeout
      jest.runAllTimers();
      expect(flush).toHaveBeenCalledTimes(2);
    });

    test('should not schedule if one is already in progress', () => {
      const destination = new Destination();
      destination.scheduled = true;
      const flush = jest.spyOn(destination, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
      destination.schedule(0);
      expect(flush).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
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
          delay: 0,
        },
      ];
      destination.queueBuffer = new Set([
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          delay: 0,
        },
      ]);
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush();
      expect(destination.queue).toEqual([]);
      expect(destination.queueBuffer.size).toEqual(1);
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
          delay: 0,
        },
      ];
      destination.queueBuffer = new Set([
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
          delay: 0,
        },
      ]);
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush(true);
      expect(destination.queue).toEqual([]);
      expect(destination.queueBuffer.size).toEqual(0);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('send', () => {
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
        delay: 0,
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
        delay: 0,
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

    test('should handle unexpected error', async () => {
      const destination = new Destination();
      const callback = jest.fn();
      const context = {
        attempts: 0,
        callback,
        event: {
          event_type: 'event_type',
        },
        delay: 0,
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
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('addToBackup', () => {
    test('should add to back up and take snapshot', () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.saveEvents = true;
      const event = {
        event_type: 'hello',
      };
      const snapshot = jest.spyOn(destination, 'snapshot').mockReturnValueOnce(undefined);
      destination.addToBackup(event);
      expect(destination.backup.size).toBe(1);
      expect(snapshot).toHaveBeenCalledTimes(1);
    });

    test('should not take snapshot', () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.saveEvents = false;
      const event = {
        event_type: 'hello',
      };
      const snapshot = jest.spyOn(destination, 'snapshot').mockReturnValueOnce(undefined);
      destination.addToBackup(event);
      expect(destination.backup.size).toBe(0);
      expect(snapshot).toHaveBeenCalledTimes(0);
    });
  });

  describe('removeFromBackup', () => {
    test('should remove from back up and take snapshot', () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.saveEvents = true;
      const event = {
        event_type: 'hello',
      };
      destination.backup.add(event);
      expect(destination.backup.size).toBe(1);
      const snapshot = jest.spyOn(destination, 'snapshot').mockReturnValueOnce(undefined);
      destination.removeFromBackup(event);
      expect(destination.backup.size).toBe(0);
      expect(snapshot).toHaveBeenCalledTimes(1);
    });

    test('should not take snapshot', () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.saveEvents = false;
      const event = {
        event_type: 'hello',
      };
      const snapshot = jest.spyOn(destination, 'snapshot').mockReturnValueOnce(undefined);
      destination.removeFromBackup(event);
      expect(destination.backup.size).toBe(0);
      expect(snapshot).toHaveBeenCalledTimes(0);
    });
  });

  describe('snapshot', () => {
    test('should save to storage provider', () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.saveEvents = true;
      const set = jest.spyOn(destination.config.storageProvider, 'set').mockReturnValueOnce(undefined);
      destination.snapshot();
      expect(set).toHaveBeenCalledTimes(1);
    });

    test('should not save to storage provider', () => {
      const destination = new Destination();
      destination.config = useDefaultConfig();
      destination.config.saveEvents = false;
      const set = jest.spyOn(destination.config.storageProvider, 'set').mockReturnValueOnce(undefined);
      destination.snapshot();
      expect(set).toHaveBeenCalledTimes(0);
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
      destination.backoff = 10;
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
      expect(results[1].code).toBe(200);
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
      destination.backoff = 10;
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
      destination.backoff = 10;
      destination.throttle = 1;
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
        }),
        // exceed daily device quota
        destination.execute({
          event_type: 'event_type',
          user_id: '1',
          device_id: '1',
        }),
        // exceed daily user quota
        destination.execute({
          event_type: 'event_type',
          user_id: '2',
          device_id: '2',
        }),
        // success
        destination.execute({
          event_type: 'event_type',
          user_id: '3',
          device_id: '3',
        }),
      ]);
      expect(results[0].code).toBe(200);
      expect(results[1].code).toBe(429);
      expect(results[2].code).toBe(429);
      expect(results[3].code).toBe(200);
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
      destination.backoff = 10;
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
      destination.backoff = 10;
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
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(results[0].code).toBe(500);
      expect(results[1].code).toBe(500);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });
  });
});
