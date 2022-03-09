import { createConfig } from '../../src/config';
import { Destination } from '../../src/plugins/destination';
import { DestinationContext, Status } from '@amplitude/analytics-types';
import { DEFAULT_OPTIONS, useDefaultConfig } from '../helpers/default';

describe('destination', () => {
  describe('setup', () => {
    test('should setup plugin', async () => {
      const destination = new Destination('name');
      const config = useDefaultConfig();
      config.serverUrl = 'url';
      config.flushMaxRetries = 0;
      config.flushQueueSize = 0;
      config.flushIntervalMillis = 0;
      await destination.setup(config);
      expect(destination.transportProvider).toBeDefined();
      expect(destination.serverUrl).toBe('url');
      expect(destination.flushMaxRetries).toBe(0);
      expect(destination.flushQueueSize).toBe(0);
      expect(destination.flushIntervalMillis).toBe(0);
    });
  });

  describe('execute', () => {
    test('should execute plugin', async () => {
      const destination = new Destination('name');
      const addToQueue = jest.spyOn(destination, 'addToQueue').mockImplementation((context: DestinationContext) => {
        context.callback({ statusCode: 200, status: Status.Success });
      });
      const event = {
        event_type: 'event_type',
      };
      await destination.execute(event);
      expect(addToQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('addToQueue', () => {
    test('should add to queue and schedule a flush', () => {
      const destination = new Destination('name');
      const schedule = jest.spyOn(destination, 'schedule').mockReturnValueOnce(undefined);
      const event = {
        event_type: 'event_type',
      };
      const context = {
        event,
        callback: () => undefined,
        attempts: 0,
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
      const destination = new Destination('name');
      destination.scheduled = false;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
        },
      ];
      const flush = jest.spyOn(destination, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
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
      const destination = new Destination('name');
      destination.scheduled = true;
      const flush = jest.spyOn(destination, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
      destination.schedule(0);
      expect(flush).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should get batch and call send', async () => {
      const destination = new Destination('name');
      destination.flushQueueSize = 1;
      destination.queue = [
        {
          event: { event_type: 'event_type' },
          attempts: 0,
          callback: () => undefined,
        },
      ];
      const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await destination.flush();
      expect(destination.queue).toEqual([]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('send', () => {
    test('should handle no transport provider', async () => {
      const destination = new Destination('name');
      const context = {
        attempts: 0,
        callback: jest.fn(),
        event: {
          event_type: 'event_type',
        },
      };
      const result = await destination.send([context]);
      expect(result).toBe(undefined);
    });

    test('should handle unexpected error', async () => {
      const destination = new Destination('name');
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
      await destination.setup(
        createConfig('apiKey', undefined, {
          transportProvider,
        }),
      );
      await destination.send([context]);
      expect(callback).toHaveBeenCalledTimes(1);
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
      await destination.setup(config);
      const result = await destination.execute({
        event_type: 'event_type',
      });
      expect(result.statusCode).toBe(0);
      expect(result.status).toBe(Status.Unknown);
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
                silencedEvents: [],
              },
            });
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          });
      }
      const transportProvider = new Http();
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
      await destination.setup(config);
      const results = await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(results[0].statusCode).toBe(400);
      expect(results[1].statusCode).toBe(200);
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
      await destination.setup(config);
      const results = await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(results[0].statusCode).toBe(400);
      expect(results[1].statusCode).toBe(400);
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 1,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
      await destination.setup(config);
      const result = await destination.execute({
        event_type: 'event_type',
      });
      expect(result).toEqual({
        status: Status.PayloadTooLarge,
        statusCode: 413,
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      destination.backoff = 1;
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 4,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
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
      expect(results[0].statusCode).toBe(200);
      expect(results[1].statusCode).toBe(429);
      expect(results[2].statusCode).toBe(429);
      expect(results[3].statusCode).toBe(200);
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
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
      const storageProvider = DEFAULT_OPTIONS.storageProvider;
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushMaxRetries: 1,
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
        storageProvider,
      });
      await destination.setup(config);
      const results = await Promise.all([
        destination.execute({
          event_type: 'event_type',
        }),
        destination.execute({
          event_type: 'event_type',
        }),
      ]);
      expect(results[0].statusCode).toBe(500);
      expect(results[1].statusCode).toBe(500);
      expect(transportProvider.send).toHaveBeenCalledTimes(2);
    });
  });
});
