import {
  InvalidRequestError,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  SuccessSummary,
  TooManyRequestsForDeviceError,
} from '../../src/response';
import { createConfig } from '../../src/config';
import { Destination } from '../../src/plugins/destination';
import { DestinationContext } from '@amplitude/analytics-types';
import { Result } from '../../src/result';

describe('destination', () => {
  describe('setup', () => {
    test('should setup plugin', async () => {
      const destination = new Destination('name');
      const config = createConfig('apiKey');
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
        context.callback(new Result(true));
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
  });

  describe('module level integration', () => {
    test('should handle unexpected error', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.reject(new Error());
        });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
      });
      await destination.setup(config);
      const result = await destination.execute({
        event_type: 'event_type',
      });
      expect(result.success).toBe(false);
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test('should handle retry for 400 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.reject(new InvalidRequestError('error', 'key', { a: [] }, { b: [] }));
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(new SuccessSummary());
          });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
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

    test('should handle retry for 413 error with flushQueueSize of 1', async () => {
      class Http {
        send = jest.fn().mockImplementationOnce(() => {
          return Promise.reject(new PayloadTooLargeError('error'));
        });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 1,
        flushIntervalMillis: 500,
        transportProvider,
      });
      await destination.setup(config);
      const result = await destination.execute({
        event_type: 'event_type',
      });
      expect(result).toEqual({
        code: 413,
        message: 'error',
        success: false,
      });
      expect(transportProvider.send).toHaveBeenCalledTimes(1);
    });

    test('should handle retry for 413 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.reject(new PayloadTooLargeError('error'));
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(new SuccessSummary());
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(new SuccessSummary());
          });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
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
            return Promise.reject(new TooManyRequestsForDeviceError('error'));
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(new SuccessSummary());
          });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      destination.backoff = 1;
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
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

    test('should handle retry for 500 error', async () => {
      class Http {
        send = jest
          .fn()
          .mockImplementationOnce(() => {
            return Promise.reject(new ServerError());
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(new SuccessSummary());
          });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
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
            return Promise.reject(new ServiceUnavailableError());
          })
          .mockImplementationOnce(() => {
            return Promise.resolve(new SuccessSummary());
          });
      }
      const transportProvider = new Http();
      const destination = new Destination('name');
      const config = createConfig('apiKey', 'userId', {
        flushQueueSize: 2,
        flushIntervalMillis: 500,
        transportProvider,
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
  });
});
