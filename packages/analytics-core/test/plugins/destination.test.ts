import { Status } from '@amplitude/analytics-types';
import { Destination } from '../../src/plugins/destination';
import { useDefaultConfig } from '../helpers/default';

describe('module level integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /*test('should set shouldThrottled to false after throttled time', async () => {
      const destination = new Destination();
      await destination.setup(useDefaultConfig());
      destination.shouldThrottled = true;
      void destination.flush();
      
      jest.runAllTimers();

      expect(destination.shouldThrottled).toBe(false);
     })*/

  test('should set shouldThrottled to true for 429 response throttled event', async () => {
    class Http {
      send = jest.fn().mockImplementationOnce(() => {
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
      }); //.mockImplementationOnce(() => {
      //return Promise.resolve(successResponse);
      //})
    }
    const transportProvider = new Http();
    const destination = new Destination();
    //destination.throttleTimeout = 0;
    const config = {
      ...useDefaultConfig(),
      transportProvider,
    };

    await destination.setup(config);

    await destination.execute({
      event_type: 'event_type_1',
      event_id: 0,
    });
    jest.runAllTimers();
    setTimeout(
      () => {
        //
      },

      4000,
    );
    //expect(result.code).toBe(200);
    expect(destination.shouldThrottled).toBe(true);
    /*jest.runAllTimers();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(destination.shouldThrottled).toBe(false);
          resolve();
        }, 3000);
      });*/
  });

  /*
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
      }
      const transportProvider = new Http();
      const destination = new Destination();
      const config = {
        ...useDefaultConfig(),
        transportProvider,
      };
      await destination.setup(config);
      destination.throttleTimeout = 1;

      await Promise.all([
        destination.execute({
          event_type: 'event_type_1',
          event_id: 0,
        }),
        destination.execute({
          event_type: 'event_type_2',
          event_id: 1,
        }),
        destination.execute({
          event_type: 'event_type_3',
          event_id: 2,
        }),
        destination.execute({
          event_type: 'event_type_4',
          event_id: 3,
        }),
      ]);

      jest.runAllTimers();
      await Promise.resolve();
     
      expect(destination.shouldThrottled).toBe(true);
     // await destination.flush();
      
     // expect(destination.shouldThrottled).toBe(false);

     //console.log(destination.shouldThrottled);

      //expect(results[0].code).toBe(200);
      //expect(results[1].code).toBe(429);
      //expect(results[2].code).toBe(429);
      //expect(results[3].code).toBe(200);
      //expect(destination.queue.length).toBe(0);
      //expect(transportProvider.send).toHaveBeenCalledTimes(2);
    });

    */
  /*test('should add to queue and schedule timeout flush', () => {
      const destination = new Destination();
      destination.config = {
        ...useDefaultConfig(),
       // flushIntervalMillis: 1,
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
    });*/

  /*test('should handle retry for 429 error for throttled event', async () => {

      //jest.useFakeTimers();
  
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
          }).mockImplementationOnce(() => {
            return Promise.resolve(successResponse);
          })
      }
      const transportProvider = new Http();
      const destination = new Destination();
      const config = {
        ...useDefaultConfig(),
        flushQueueSize: 4,
        flushIntervalMillis: 500,
        transportProvider,
      };
      await destination.setup(config);
      await Promise.all([
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
      expect(destination.shouldThrottled).toBe(true);
      //jest.runAllTimers();

      //jest.runOnlyPendingTimers();
      //jest.useRealTimers();
    });*/
});
