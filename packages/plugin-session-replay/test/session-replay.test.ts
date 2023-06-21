import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { Logger } from '@amplitude/analytics-core';
import { BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { SessionReplayPlugin } from '../src/session-replay';

describe('SessionReplayPlugin', () => {
  const mockConfig: BrowserConfig = {
    apiKey: 'static_key',
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
    optOut: false,
    serverUrl: 'url',
    transportProvider: new FetchTransport(),
    useBatch: false,

    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieStorage: new CookieStorage(),
    cookieUpgrade: true,
    disableCookies: false,
    domain: '.amplitude.com',
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
  };
  describe('setup', () => {
    test('should setup plugin', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      expect(sessionReplay.config.transportProvider).toBeDefined();
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(0);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);
      expect(sessionReplay.storageKey).toBe('');
    });

    // test('should read from storage', async () => {
    //   const sessionReplay = new SessionReplayPlugin();
    //   const config = useDefaultConfig();
    //   const event = {
    //     event_type: 'hello',
    //   };
    //   config.storageProvider = {
    //     isEnabled: async () => true,
    //     get: async () => undefined,
    //     set: async () => undefined,
    //     remove: async () => undefined,
    //     reset: async () => undefined,
    //     getRaw: async () => undefined,
    //   };
    //   const get = jest.spyOn(config.storageProvider, 'get').mockResolvedValueOnce([event]);
    //   const execute = jest.spyOn(destination, 'execute').mockReturnValueOnce(
    //     Promise.resolve({
    //       event,
    //       message: Status.Success,
    //       code: 200,
    //     }),
    //   );
    //   await destination.setup(config);
    //   expect(get).toHaveBeenCalledTimes(1);
    //   expect(execute).toHaveBeenCalledTimes(1);
    // });

    // test('should be ok with undefined storage', async () => {
    //   const sessionReplay = new SessionReplayPlugin();
    //   const config = useDefaultConfig();
    //   config.storageProvider = undefined;
    //   const execute = jest.spyOn(destination, 'execute');
    //   await destination.setup(config);
    //   expect(execute).toHaveBeenCalledTimes(0);
    // });
  });

  // describe('execute', () => {
  //   test('should execute plugin', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const addToQueue = jest.spyOn(destination, 'addToQueue').mockImplementation((context: DestinationContext) => {
  //       context.callback({ event, code: 200, message: Status.Success });
  //     });
  //     await destination.execute(event);
  //     expect(addToQueue).toHaveBeenCalledTimes(1);
  //   });
  // });

  // describe('addToQueue', () => {
  //   test('should add to queue and schedule a flush', () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.config = {
  //       ...useDefaultConfig(),
  //       flushIntervalMillis: 0,
  //     };
  //     const schedule = jest.spyOn(destination, 'schedule').mockReturnValueOnce(undefined);
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const context = {
  //       event,
  //       callback: () => undefined,
  //       attempts: 0,
  //       timeout: 0,
  //     };
  //     destination.addToQueue(context);
  //     expect(schedule).toHaveBeenCalledTimes(1);
  //     expect(context.attempts).toBe(1);
  //   });
  // });

  // describe('schedule', () => {
  //   beforeEach(() => {
  //     jest.useFakeTimers();
  //   });

  //   afterEach(() => {
  //     jest.useRealTimers();
  //   });

  //   test('should schedule a flush', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  //     (destination as any).scheduled = null;
  //     destination.queue = [
  //       {
  //         event: { event_type: 'event_type' },
  //         attempts: 0,
  //         callback: () => undefined,
  //         timeout: 0,
  //       },
  //     ];
  //     const flush = jest
  //       .spyOn(destination, 'flush')
  //       .mockImplementationOnce(() => {
  //         // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  //         (destination as any).scheduled = null;
  //         return Promise.resolve(undefined);
  //       })
  //       .mockReturnValueOnce(Promise.resolve(undefined));
  //     destination.schedule(0);
  //     // exhause first setTimeout
  //     jest.runAllTimers();
  //     // wait for next tick to call nested setTimeout
  //     await Promise.resolve();
  //     // exhause nested setTimeout
  //     jest.runAllTimers();
  //     expect(flush).toHaveBeenCalledTimes(2);
  //   });

  //   test('should not schedule if one is already in progress', () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  //     (destination as any).scheduled = setTimeout(jest.fn, 0);
  //     const flush = jest.spyOn(destination, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
  //     destination.schedule(0);
  //     expect(flush).toHaveBeenCalledTimes(0);
  //   });
  // });

  // describe('flush', () => {
  //   test('should get batch and call send', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 1,
  //     };
  //     destination.queue = [
  //       {
  //         event: { event_type: 'event_type' },
  //         attempts: 0,
  //         callback: () => undefined,
  //         timeout: 0,
  //       },
  //     ];
  //     const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
  //     const result = await destination.flush();
  //     expect(destination.queue).toEqual([]);
  //     expect(result).toBe(undefined);
  //     expect(send).toHaveBeenCalledTimes(1);
  //   });

  //   test('should send with queue', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.config = {
  //       ...useDefaultConfig(),
  //     };
  //     destination.queue = [
  //       {
  //         event: { event_type: 'event_type' },
  //         attempts: 0,
  //         callback: () => undefined,
  //         timeout: 0,
  //       },
  //     ];
  //     const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
  //     const result = await destination.flush();
  //     expect(destination.queue).toEqual([]);
  //     expect(result).toBe(undefined);
  //     expect(send).toHaveBeenCalledTimes(1);
  //   });

  //   test('should send later', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.config = {
  //       ...useDefaultConfig(),
  //     };
  //     destination.queue = [
  //       {
  //         event: { event_type: 'event_type' },
  //         attempts: 0,
  //         callback: () => undefined,
  //         timeout: 1000,
  //       },
  //     ];
  //     const send = jest.spyOn(destination, 'send').mockReturnValueOnce(Promise.resolve());
  //     const result = await destination.flush();
  //     expect(destination.queue).toEqual([
  //       {
  //         event: { event_type: 'event_type' },
  //         attempts: 0,
  //         // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  //         callback: expect.any(Function),
  //         timeout: 1000,
  //       },
  //     ]);
  //     expect(result).toBe(undefined);
  //     expect(send).toHaveBeenCalledTimes(0);
  //   });
  // });

  // describe('send', () => {
  //   test('should include min id length', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const callback = jest.fn();
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const context = {
  //       attempts: 0,
  //       callback,
  //       event,
  //       timeout: 0,
  //     };
  //     const transportProvider = {
  //       send: jest.fn().mockImplementationOnce((_url: string, payload: Payload) => {
  //         expect(payload.options?.min_id_length).toBe(10);
  //         return Promise.resolve({
  //           status: Status.Success,
  //           statusCode: 200,
  //           body: {
  //             eventsIngested: 1,
  //             payloadSizeBytes: 1,
  //             serverUploadTime: 1,
  //           },
  //         });
  //       }),
  //     };
  //     await destination.setup({
  //       ...useDefaultConfig(),
  //       transportProvider,
  //       apiKey: API_KEY,
  //       minIdLength: 10,
  //     });
  //     await destination.send([context]);
  //     expect(callback).toHaveBeenCalledTimes(1);
  //     expect(callback).toHaveBeenCalledWith({
  //       event,
  //       code: 200,
  //       message: SUCCESS_MESSAGE,
  //     });
  //   });

  //   test('should not include extra', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const callback = jest.fn();
  //     const event = {
  //       event_type: 'event_type',
  //       extra: { 'extra-key': 'extra-value' },
  //     };
  //     const context = {
  //       attempts: 0,
  //       callback,
  //       event,
  //       timeout: 0,
  //     };
  //     const transportProvider = {
  //       send: jest.fn().mockImplementationOnce((_url: string, payload: Payload) => {
  //         expect(payload.options?.min_id_length).toBe(10);
  //         expect(payload.events.some((event) => !!event.extra)).toBeFalsy();
  //         return Promise.resolve({
  //           status: Status.Success,
  //           statusCode: 200,
  //           body: {
  //             eventsIngested: 1,
  //             payloadSizeBytes: 1,
  //             serverUploadTime: 1,
  //           },
  //         });
  //       }),
  //     };
  //     await destination.setup({
  //       ...useDefaultConfig(),
  //       transportProvider,
  //       apiKey: API_KEY,
  //       minIdLength: 10,
  //     });
  //     await destination.send([context]);
  //     expect(callback).toHaveBeenCalledTimes(1);
  //     expect(callback).toHaveBeenCalledWith({
  //       event,
  //       code: 200,
  //       message: SUCCESS_MESSAGE,
  //     });
  //   });

  //   test('should not retry', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const callback = jest.fn();
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const context = {
  //       attempts: 0,
  //       callback,
  //       event,
  //       timeout: 0,
  //     };
  //     const transportProvider = {
  //       send: jest.fn().mockImplementationOnce(() => {
  //         return Promise.resolve({
  //           status: Status.Failed,
  //           statusCode: 500,
  //         });
  //       }),
  //     };
  //     await destination.setup({
  //       ...useDefaultConfig(),
  //       transportProvider,
  //       apiKey: API_KEY,
  //     });
  //     await destination.send([context], false);
  //     expect(callback).toHaveBeenCalledTimes(1);
  //     expect(callback).toHaveBeenCalledWith({
  //       event,
  //       code: 500,
  //       message: Status.Failed,
  //     });
  //   });

  //   test('should provide error details', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const callback = jest.fn();
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const context = {
  //       attempts: 0,
  //       callback,
  //       event,
  //       timeout: 0,
  //     };
  //     const body = {
  //       error: 'Request missing required field',
  //       missingField: 'user_id',
  //     };
  //     const transportProvider = {
  //       send: jest.fn().mockImplementationOnce(() => {
  //         return Promise.resolve({
  //           status: Status.Invalid,
  //           statusCode: 400,
  //           body,
  //         });
  //       }),
  //     };
  //     await destination.setup({
  //       ...useDefaultConfig(),
  //       transportProvider,
  //       apiKey: API_KEY,
  //     });
  //     await destination.send([context], false);
  //     expect(callback).toHaveBeenCalledTimes(1);
  //     expect(callback).toHaveBeenCalledWith({
  //       event,
  //       code: 400,
  //       message: `${Status.Invalid}: ${JSON.stringify(body, null, 2)}`,
  //     });
  //   });

  //   test('should handle no api key', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const callback = jest.fn();
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const context = {
  //       attempts: 0,
  //       callback,
  //       event,
  //       timeout: 0,
  //     };
  //     const transportProvider = {
  //       send: jest.fn().mockImplementationOnce(() => {
  //         throw new Error();
  //       }),
  //     };
  //     await destination.setup({
  //       ...useDefaultConfig(),
  //       transportProvider,
  //       apiKey: '',
  //     });
  //     await destination.send([context]);
  //     expect(callback).toHaveBeenCalledTimes(1);
  //     expect(callback).toHaveBeenCalledWith({
  //       event,
  //       code: 400,
  //       message: MISSING_API_KEY_MESSAGE,
  //     });
  //   });

  //   test('should handle unexpected error', async () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     const callback = jest.fn();
  //     const context = {
  //       attempts: 0,
  //       callback,
  //       event: {
  //         event_type: 'event_type',
  //       },
  //       timeout: 0,
  //     };
  //     const transportProvider = {
  //       send: jest.fn().mockImplementationOnce(() => {
  //         throw new Error();
  //       }),
  //     };
  //     await destination.setup({
  //       ...useDefaultConfig(),
  //       transportProvider,
  //     });
  //     await destination.send([context]);
  //     expect(callback).toHaveBeenCalledTimes(1);
  //   });
  // });

  // describe('saveEvents', () => {
  //   test('should save to storage provider', () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.config = useDefaultConfig();
  //     destination.config.storageProvider = {
  //       isEnabled: async () => true,
  //       get: async () => undefined,
  //       set: async () => undefined,
  //       remove: async () => undefined,
  //       reset: async () => undefined,
  //       getRaw: async () => undefined,
  //     };
  //     const set = jest.spyOn(destination.config.storageProvider, 'set').mockResolvedValueOnce(undefined);
  //     destination.saveEvents();
  //     expect(set).toHaveBeenCalledTimes(1);
  //   });

  //   test('should be ok with no storage provider', () => {
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.config = useDefaultConfig();
  //     destination.config.storageProvider = undefined;
  //     expect(destination.saveEvents()).toBe(undefined);
  //   });
  // });

  // describe('module level integration', () => {
  //   const successResponse = {
  //     status: Status.Success,
  //     statusCode: 200,
  //     body: {
  //       eventsIngested: 1,
  //       payloadSizeBytes: 1,
  //       serverUploadTime: 1,
  //     },
  //   };

  //   test('should handle unexpected error', async () => {
  //     class Http {
  //       send = jest.fn().mockImplementationOnce(() => {
  //         return Promise.resolve(null);
  //       });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const result = await destination.execute({
  //       event_type: 'event_type',
  //     });
  //     expect(result.code).toBe(0);
  //     expect(result.message).toBe(UNEXPECTED_ERROR_MESSAGE);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(1);
  //   });

  //   test('should not retry with invalid api key', async () => {
  //     class Http {
  //       send = jest.fn().mockImplementationOnce(() => {
  //         return Promise.resolve({
  //           status: Status.Invalid,
  //           statusCode: 400,
  //           body: {
  //             error: INVALID_API_KEY,
  //           },
  //         });
  //       });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.retryTimeout = 10;
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const results = await Promise.all([
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //     ]);
  //     expect(results[0].code).toBe(400);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(1);
  //   });

  //   test('should handle retry for 400 error', async () => {
  //     class Http {
  //       send = jest
  //         .fn()
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve({
  //             status: Status.Invalid,
  //             statusCode: 400,
  //             body: {
  //               error: 'error',
  //               missingField: '',
  //               eventsWithInvalidFields: { a: [0] },
  //               eventsWithMissingFields: { b: [] },
  //               eventsWithInvalidIdLengths: {},
  //               silencedEvents: [],
  //             },
  //           });
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve(successResponse);
  //         });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.retryTimeout = 10;
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const results = await Promise.all([
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //     ]);
  //     expect(results[0].code).toBe(400);
  //     expect(results[1].code).toBe(200);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(2);
  //   });

  //   test('should handle retry for 400 error with missing body field', async () => {
  //     class Http {
  //       send = jest.fn().mockImplementationOnce(() => {
  //         return Promise.resolve({
  //           status: Status.Invalid,
  //           statusCode: 400,
  //           body: {
  //             error: 'error',
  //             missingField: 'key',
  //             eventsWithInvalidFields: {},
  //             eventsWithMissingFields: {},
  //             silencedEvents: [],
  //           },
  //         });
  //       });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const results = await Promise.all([
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //     ]);
  //     expect(results[0].code).toBe(400);
  //     expect(results[1].code).toBe(400);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(1);
  //   });

  //   test('should handle retry for 413 error with flushQueueSize of 1', async () => {
  //     class Http {
  //       send = jest.fn().mockImplementationOnce(() => {
  //         return Promise.resolve({
  //           status: Status.PayloadTooLarge,
  //           statusCode: 413,
  //           body: {
  //             error: 'error',
  //           },
  //         });
  //       });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 1,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const event = {
  //       event_type: 'event_type',
  //     };
  //     const result = await destination.execute(event);
  //     expect(result).toEqual({
  //       event,
  //       message: 'error',
  //       code: 413,
  //     });
  //     expect(transportProvider.send).toHaveBeenCalledTimes(1);
  //   });

  //   test('should handle retry for 413 error', async () => {
  //     class Http {
  //       send = jest
  //         .fn()
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve({
  //             status: Status.PayloadTooLarge,
  //             statusCode: 413,
  //             body: {
  //               error: 'error',
  //             },
  //           });
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve(successResponse);
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve(successResponse);
  //         });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.retryTimeout = 10;
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     await Promise.all([
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //     ]);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(3);
  //   });

  //   test('should handle retry for 429 error', async () => {
  //     class Http {
  //       send = jest
  //         .fn()
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve({
  //             status: Status.RateLimit,
  //             statusCode: 429,
  //             body: {
  //               error: 'error',
  //               epsThreshold: 1,
  //               throttledDevices: {},
  //               throttledUsers: {},
  //               exceededDailyQuotaDevices: {
  //                 '1': 1,
  //               },
  //               exceededDailyQuotaUsers: {
  //                 '2': 1,
  //               },
  //               throttledEvents: [0],
  //             },
  //           });
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve(successResponse);
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve(successResponse);
  //         });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.retryTimeout = 10;
  //     destination.throttleTimeout = 1;
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 4,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const results = await Promise.all([
  //       // throttled
  //       destination.execute({
  //         event_type: 'event_type',
  //         user_id: '0',
  //         device_id: '0',
  //       }),
  //       // exceed daily device quota
  //       destination.execute({
  //         event_type: 'event_type',
  //         user_id: '1',
  //         device_id: '1',
  //       }),
  //       // exceed daily user quota
  //       destination.execute({
  //         event_type: 'event_type',
  //         user_id: '2',
  //         device_id: '2',
  //       }),
  //       // success
  //       destination.execute({
  //         event_type: 'event_type',
  //         user_id: '3',
  //         device_id: '3',
  //       }),
  //     ]);
  //     expect(results[0].code).toBe(200);
  //     expect(results[1].code).toBe(429);
  //     expect(results[2].code).toBe(429);
  //     expect(results[3].code).toBe(200);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(2);
  //   });

  //   test('should handle retry for 500 error', async () => {
  //     class Http {
  //       send = jest
  //         .fn()
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve({
  //             statusCode: 500,
  //             status: Status.Failed,
  //           });
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve(successResponse);
  //         });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.retryTimeout = 10;
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     await Promise.all([
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //     ]);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(2);
  //   });

  //   test('should handle retry for 503 error', async () => {
  //     class Http {
  //       send = jest
  //         .fn()
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve({
  //             statusCode: 500,
  //             status: Status.Failed,
  //           });
  //         })
  //         .mockImplementationOnce(() => {
  //           return Promise.resolve({
  //             statusCode: 500,
  //             status: Status.Failed,
  //           });
  //         });
  //     }
  //     const transportProvider = new Http();
  //     const sessionReplay = new SessionReplayPlugin();
  //     destination.retryTimeout = 10;
  //     const config = {
  //       ...useDefaultConfig(),
  //       flushMaxRetries: 1,
  //       flushQueueSize: 2,
  //       flushIntervalMillis: 500,
  //       transportProvider,
  //     };
  //     await destination.setup(config);
  //     const results = await Promise.all([
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //       destination.execute({
  //         event_type: 'event_type',
  //       }),
  //     ]);
  //     expect(results[0].code).toBe(500);
  //     expect(results[1].code).toBe(500);
  //     expect(transportProvider.send).toHaveBeenCalledTimes(1);
  //   });
  // });
});
