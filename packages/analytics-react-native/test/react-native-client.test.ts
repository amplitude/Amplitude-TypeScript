import { AmplitudeReactNative } from '../src/react-native-client';
import * as core from '@amplitude/analytics-core';
import * as CookieMigration from '../src/cookie-migration';
import { Status, UserSession, Event } from '@amplitude/analytics-core';
import { isWeb } from '../src/utils/platform';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAnalyticsConnector } from '@amplitude/analytics-client-common';
import * as Config from '../src/config';
import { getCookieName as getStorageKey } from '@amplitude/analytics-client-common/src';

describe('react-native-client', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';
  const DEVICE_ID = 'DEVICE_ID';
  const attributionConfig = {
    attribution: {
      disabled: true,
    },
  };

  afterEach(async () => {
    // clean up cookies
    // due to jest env, cookies are always preset and needs to be cleaned up
    document.cookie = 'AMP_API_KEY=null; expires=-1';
    if (!isWeb()) {
      await AsyncStorage.clear();
    }
  });

  describe('init', () => {
    test('should initialize client', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
      }).promise;
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
    });

    test('should initialize without error when apiKey is undefined', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeReactNative();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await client.init(undefined as any, USER_ID, {
        ...attributionConfig,
      }).promise;
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
    });

    test('should read from old cookies config', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
        deviceId: DEVICE_ID,
        sessionId: 1,
        lastEventTime: Date.now() - 1000,
      });
      const cookieStorage = new core.MemoryStorage<UserSession>();
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        cookieStorage,
        ...attributionConfig,
      }).promise;
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).toBe(1);
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
    });

    test('should call prevent concurrent init executions', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const useNodeConfig = jest.spyOn(Config, 'useReactNativeConfig');
      const client = new AmplitudeReactNative();
      await Promise.all([
        client.init(API_KEY, USER_ID, {
          ...attributionConfig,
        }).promise,
        client.init(API_KEY, USER_ID, {
          ...attributionConfig,
        }).promise,
        client.init(API_KEY, USER_ID, {
          ...attributionConfig,
        }).promise,
      ]);
      // NOTE: `parseOldCookies` and `useNodeConfig` are only called once despite multiple init calls
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(useNodeConfig).toHaveBeenCalledTimes(1);
    });

    test('should read from new cookies config', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const cookieStorage = new core.MemoryStorage<UserSession>();
      jest.spyOn(cookieStorage, 'set').mockResolvedValue();
      jest.spyOn(cookieStorage, 'get').mockResolvedValue({
        sessionId: 1,
        deviceId: DEVICE_ID,
        optOut: false,
      });
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, {
        optOut: true,
        cookieStorage,
        ...attributionConfig,
      }).promise;
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).not.toBe(1);
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
    });

    test('should track attributions', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeReactNative();
      const runAttributionStrategy = jest
        .spyOn(client, 'runAttributionStrategy')
        .mockReturnValueOnce(Promise.resolve(undefined));
      await client.init(API_KEY, USER_ID).promise;
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(runAttributionStrategy).toHaveBeenCalledTimes(1);
    });

    test('should track attributions with config', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeReactNative();
      const runAttributionStrategy = jest
        .spyOn(client, 'runAttributionStrategy')
        .mockReturnValueOnce(Promise.resolve(undefined));
      await client.init(API_KEY, USER_ID, {
        attribution: {
          excludeReferrers: [],
          initialEmptyValue: '',
        },
      }).promise;
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(runAttributionStrategy).toHaveBeenCalledTimes(1);
    });

    test('should set user id and device id in analytics connector', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      jest.spyOn(cookieStorage, 'set').mockResolvedValue();
      jest.spyOn(cookieStorage, 'get').mockResolvedValueOnce(undefined).mockResolvedValue({
        sessionId: 1,
        deviceId: DEVICE_ID,
        optOut: false,
      });
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, {
        optOut: true,
        cookieStorage,
        ...attributionConfig,
      }).promise;
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getUserId()).toBe(USER_ID);
      const identity = getAnalyticsConnector().identityStore.getIdentity();
      expect(identity.deviceId).toBe(DEVICE_ID);
      expect(identity.userId).toBe(USER_ID);
    });

    test('should set up event bridge and track events', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        ...attributionConfig,
      }).promise;
      const track = jest.spyOn(client, 'track').mockReturnValueOnce({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      });
      getAnalyticsConnector().eventBridge.logEvent({
        eventType: 'event_type',
        eventProperties: {
          k: 'v',
        },
      });
      expect(track).toHaveBeenCalledTimes(1);
    });
  });

  if (isWeb()) {
    describe('trackCampaign', () => {
      test('should track campaign', async () => {
        const client = new AmplitudeReactNative();
        const track = jest.spyOn(client, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });
        await client.init(API_KEY, USER_ID, {
          attribution: {
            disabled: false,
          },
        }).promise;
        const result = await client.runAttributionStrategy();
        expect(result).toBe(undefined);
        expect(track).toHaveBeenCalledTimes(1);
      });
    });
  }

  describe('getUserId', () => {
    test('should get user id', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(USER_ID);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeReactNative();
      expect(client.getUserId()).toBe(undefined);
    });
  });

  describe('setUserId', () => {
    test('should set user id', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(undefined);
      client.setUserId(USER_ID);
      expect(client.getUserId()).toBe(USER_ID);
    });

    test('should defer set user id', () => {
      return new Promise<void>((resolve) => {
        const client = new AmplitudeReactNative();
        void client
          .init(API_KEY, undefined, {
            ...attributionConfig,
          })
          .promise.then(() => {
            expect(client.getUserId()).toBe('user@amplitude.com');
            resolve();
          });
        client.setUserId('user@amplitude.com');
      });
    });
  });

  describe('getDeviceId', () => {
    test('should get device id', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        deviceId: DEVICE_ID,
        ...attributionConfig,
      }).promise;
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeReactNative();
      expect(client.getDeviceId()).toBe(undefined);
    });
  });

  describe('setDeviceId', () => {
    test('should set device id config', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      client.setDeviceId(DEVICE_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });

    test('should defer set device id', () => {
      return new Promise<void>((resolve) => {
        const client = new AmplitudeReactNative();
        void client
          .init(API_KEY, undefined, {
            ...attributionConfig,
          })
          .promise.then(() => {
            expect(client.getDeviceId()).toBe('asdfg');
            resolve();
          });
        client.setDeviceId('asdfg');
      });
    });
  });

  describe('reset', () => {
    test('should reset user id and generate new device id config', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY).promise;
      client.setUserId(USER_ID);
      client.setDeviceId(DEVICE_ID);
      expect(client.getUserId()).toBe(USER_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      client.reset();
      expect(client.getUserId()).toBe(undefined);
      expect(client.getDeviceId()).not.toBe(DEVICE_ID);
    });
  });

  describe('getSessionId', () => {
    test('should get session id', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        sessionId: 1,
        ...attributionConfig,
      }).promise;
      expect(client.getSessionId()).toBe(1);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeReactNative();
      expect(client.getSessionId()).toBe(undefined);
    });
  });

  describe('setSessionId', () => {
    test('should set session id', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      client.setSessionId(1);
      expect(client.getSessionId()).toBe(1);
    });

    test('should defer set session id', () => {
      return new Promise<void>((resolve) => {
        const client = new AmplitudeReactNative();
        void client
          .init(API_KEY, undefined, {
            ...attributionConfig,
          })
          .promise.then(() => {
            expect(client.getSessionId()).toBe(1);
            resolve();
          });
        client.setSessionId(1);
      });
    });
  });

  describe('setOptOut', () => {
    test('should set opt out', async () => {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
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
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        transportProvider: {
          send,
        },
        ...attributionConfig,
      }).promise;
      const identifyObject = new core.Identify();
      const result = await client.identify(identifyObject, { user_id: '123', device_id: '123' }).promise;
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
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        transportProvider: {
          send,
        },
        ...attributionConfig,
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
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, undefined, {
        transportProvider: {
          send,
        },
        ...attributionConfig,
      }).promise;
      const revenueObject = new core.Revenue();
      const result = await client.revenue(revenueObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('session management', () => {
    class AmplitudeReactNativeTest extends AmplitudeReactNative {
      currentTime: number;

      constructor(currentTime: number) {
        super();
        this.currentTime = currentTime;
      }

      currentTimeMillis(): number {
        return this.currentTime;
      }

      setActive(currentTime: number) {
        this.currentTime = currentTime;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.handleAppStateChange('active');
      }

      setBackground(timestamp: number) {
        this.currentTime = timestamp;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.handleAppStateChange('background');
      }
    }

    const sendResponse = {
      status: Status.Success,
      statusCode: 200,
      body: {
        eventsIngested: 1,
        payloadSizeBytes: 1,
        serverUploadTime: 1,
      },
    };

    const clientOptions = (
      send: any,
      cookieStorage: core.MemoryStorage<UserSession>,
      trackingSessionEvents: boolean,
      sessionId?: number,
    ) => ({
      transportProvider: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        send,
      },
      cookieStorage,
      sessionTimeout: 100,
      sessionId,
      trackingSessionEvents,
      ...attributionConfig,
    });

    test('session restore', async () => {
      const send = jest.fn().mockReturnValue(sendResponse);
      const cookieStorage = new core.MemoryStorage<UserSession>();

      const client1 = new AmplitudeReactNativeTest(950);
      await client1.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

      client1.setActive(1000);

      expect(client1.config.sessionId).toEqual(950);
      expect(client1.config.lastEventTime).toEqual(1000);
      expect(client1.config.lastEventId).toEqual(1);

      void client1.track({ event_type: 'event-1', time: 1200 });

      expect(client1.config.sessionId).toEqual(950);
      expect(client1.config.lastEventTime).toEqual(1200);
      expect(client1.config.lastEventId).toEqual(2);

      const client2 = new AmplitudeReactNativeTest(1250);
      await client2.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

      expect(client2.config.sessionId).toEqual(950);
      expect(client2.config.lastEventTime).toEqual(1250);
      expect(client2.config.lastEventId).toEqual(2);

      void client2.track({ event_type: 'event-2', time: 1270 });

      expect(client2.config.sessionId).toEqual(950);
      expect(client2.config.lastEventTime).toEqual(1270);
      expect(client2.config.lastEventId).toEqual(3);

      const client3 = new AmplitudeReactNativeTest(1300);
      await client3.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

      expect(client3.config.sessionId).toEqual(950);
      expect(client3.config.lastEventTime).toEqual(1300);
      expect(client3.config.lastEventId).toEqual(3);

      client3.setActive(1500);

      expect(client3.config.sessionId).toEqual(1500);
      expect(client3.config.lastEventTime).toEqual(1500);
      expect(client3.config.lastEventId).toEqual(5);
    });

    describe('track session events', () => {
      test('should assign session ids and track session_start/session_end events', async () => {
        const send = jest.fn().mockReturnValue(sendResponse);
        const client = new AmplitudeReactNativeTest(950);
        const cookieStorage = new core.MemoryStorage<UserSession>();
        await cookieStorage.set(getStorageKey(API_KEY), { sessionId: 500, lastEventTime: 850, optOut: false });

        await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true)).promise;

        void client.track({ event_type: 'event-1', time: 1000 });
        void client.track({ event_type: 'event-2', time: 1050 });
        void client.track({ event_type: 'event-3', time: 1200 });
        void client.track({ event_type: 'event-4', time: 1350 });

        client.setActive(1500);

        void client.track({ event_type: 'event-5', time: 1700 });

        client.setBackground(1730);

        void client.track({ event_type: 'event-6', time: 1750 });
        void client.track({ event_type: 'event-7', time: 2000 });

        client.setActive(2050);

        await client.track({ event_type: 'event-8', time: 2200 }).promise;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
        expect(events.length).toEqual(18);
        events.forEach((event, i) => expect(event.event_id).toEqual(i + 1));

        expect(events[0].event_type).toEqual('session_end');
        expect(events[0].session_id).toEqual(500);
        expect(events[0].time).toEqual(851);

        expect(events[1].event_type).toEqual('session_start');
        expect(events[1].session_id).toEqual(950);
        expect(events[1].time).toEqual(950);

        expect(events[2].event_type).toEqual('event-1');
        expect(events[2].session_id).toEqual(950);
        expect(events[2].time).toEqual(1000);

        expect(events[3].event_type).toEqual('event-2');
        expect(events[3].session_id).toEqual(950);
        expect(events[3].time).toEqual(1050);

        expect(events[4].event_type).toEqual('session_end');
        expect(events[4].session_id).toEqual(950);
        expect(events[4].time).toEqual(1051);

        expect(events[5].event_type).toEqual('session_start');
        expect(events[5].session_id).toEqual(1200);
        expect(events[5].time).toEqual(1200);

        expect(events[6].event_type).toEqual('event-3');
        expect(events[6].session_id).toEqual(1200);
        expect(events[6].time).toEqual(1200);

        expect(events[7].event_type).toEqual('session_end');
        expect(events[7].session_id).toEqual(1200);
        expect(events[7].time).toEqual(1201);

        expect(events[8].event_type).toEqual('session_start');
        expect(events[8].session_id).toEqual(1350);
        expect(events[8].time).toEqual(1350);

        expect(events[9].event_type).toEqual('event-4');
        expect(events[9].session_id).toEqual(1350);
        expect(events[9].time).toEqual(1350);

        expect(events[10].event_type).toEqual('session_end');
        expect(events[10].session_id).toEqual(1350);
        expect(events[10].time).toEqual(1351);

        expect(events[11].event_type).toEqual('session_start');
        expect(events[11].session_id).toEqual(1500);
        expect(events[11].time).toEqual(1500);

        expect(events[12].event_type).toEqual('event-5');
        expect(events[12].session_id).toEqual(1500);
        expect(events[12].time).toEqual(1700);

        expect(events[13].event_type).toEqual('event-6');
        expect(events[13].session_id).toEqual(1500);
        expect(events[13].time).toEqual(1750);

        expect(events[14].event_type).toEqual('session_end');
        expect(events[14].session_id).toEqual(1500);
        expect(events[14].time).toEqual(1751);

        expect(events[15].event_type).toEqual('session_start');
        expect(events[15].session_id).toEqual(2000);
        expect(events[15].time).toEqual(2000);

        expect(events[16].event_type).toEqual('event-7');
        expect(events[16].session_id).toEqual(2000);
        expect(events[16].time).toEqual(2000);

        expect(events[17].event_type).toEqual('event-8');
        expect(events[17].session_id).toEqual(2000);
        expect(events[17].time).toEqual(2200);
      });

      test('should use explicit session ids and track session_start/session_end events', async () => {
        const send = jest.fn().mockReturnValue(sendResponse);
        const client = new AmplitudeReactNativeTest(950);
        const cookieStorage = new core.MemoryStorage<UserSession>();
        await cookieStorage.set(getStorageKey(API_KEY), { sessionId: 500, lastEventTime: 850, optOut: false });

        await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, true, 1000)).promise;

        void client.track({ event_type: 'event-1', time: 1000 });
        void client.track({ event_type: 'event-2', time: 1050 });

        client.currentTime = 1100;
        client.setSessionId(5000);

        void client.track({ event_type: 'event-3', time: 1200 });
        void client.track({ event_type: 'event-4', time: 1350 });

        client.setActive(1500);

        void client.track({ event_type: 'event-5', time: 1700 });

        client.currentTime = 1720;
        client.setSessionId(5050);

        client.setBackground(1730);

        void client.track({ event_type: 'event-6', time: 1750 });
        void client.track({ event_type: 'event-7', time: 2000 });

        client.setActive(2050);

        await client.track({ event_type: 'event-8', time: 2200 }).promise;

        client.setSessionId(6000);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
        expect(events.length).toEqual(14);
        events.forEach((event, i) => expect(event.event_id).toEqual(i + 1));

        expect(events[0].event_type).toEqual('session_end');
        expect(events[0].session_id).toEqual(500);
        expect(events[0].time).toEqual(851);

        expect(events[1].event_type).toEqual('session_start');
        expect(events[1].session_id).toEqual(1000);
        expect(events[1].time).toEqual(950);

        expect(events[2].event_type).toEqual('event-1');
        expect(events[2].session_id).toEqual(1000);
        expect(events[2].time).toEqual(1000);

        expect(events[3].event_type).toEqual('event-2');
        expect(events[3].session_id).toEqual(1000);
        expect(events[3].time).toEqual(1050);

        expect(events[4].event_type).toEqual('session_end');
        expect(events[4].session_id).toEqual(1000);
        expect(events[4].time).toEqual(1051);

        expect(events[5].event_type).toEqual('session_start');
        expect(events[5].session_id).toEqual(5000);
        expect(events[5].time).toEqual(1100);

        expect(events[6].event_type).toEqual('event-3');
        expect(events[6].session_id).toEqual(5000);
        expect(events[6].time).toEqual(1200);

        expect(events[7].event_type).toEqual('event-4');
        expect(events[7].session_id).toEqual(5000);
        expect(events[7].time).toEqual(1350);

        expect(events[8].event_type).toEqual('event-5');
        expect(events[8].session_id).toEqual(5000);
        expect(events[8].time).toEqual(1700);

        expect(events[9].event_type).toEqual('session_end');
        expect(events[9].session_id).toEqual(5000);
        expect(events[9].time).toEqual(1701);

        expect(events[10].event_type).toEqual('session_start');
        expect(events[10].session_id).toEqual(5050);
        expect(events[10].time).toEqual(1720);

        expect(events[11].event_type).toEqual('event-6');
        expect(events[11].session_id).toEqual(5050);
        expect(events[11].time).toEqual(1750);

        expect(events[12].event_type).toEqual('event-7');
        expect(events[12].session_id).toEqual(5050);
        expect(events[12].time).toEqual(2000);

        expect(events[13].event_type).toEqual('event-8');
        expect(events[13].session_id).toEqual(5050);
        expect(events[13].time).toEqual(2200);
      });
    });

    describe('do not track session events', () => {
      test('should assign session ids and do not track session_start/session_end events', async () => {
        const send = jest.fn().mockReturnValue(sendResponse);
        const client = new AmplitudeReactNativeTest(950);
        const cookieStorage = new core.MemoryStorage<UserSession>();
        await cookieStorage.set(getStorageKey(API_KEY), { sessionId: 500, lastEventTime: 850, optOut: false });

        await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, false)).promise;

        void client.track({ event_type: 'event-1', time: 1000 });
        void client.track({ event_type: 'event-2', time: 1050 });
        void client.track({ event_type: 'event-3', time: 1200 });
        void client.track({ event_type: 'event-4', time: 1350 });

        client.setActive(1500);

        void client.track({ event_type: 'event-5', time: 1700 });

        client.setBackground(1730);

        void client.track({ event_type: 'event-6', time: 1750 });
        void client.track({ event_type: 'event-7', time: 2000 });

        client.setActive(2050);

        await client.track({ event_type: 'event-8', time: 2200 }).promise;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
        expect(events.length).toEqual(8);
        events.forEach((event, i) => expect(event.event_id).toEqual(i + 1));

        expect(events[0].event_type).toEqual('event-1');
        expect(events[0].session_id).toEqual(950);
        expect(events[0].time).toEqual(1000);

        expect(events[1].event_type).toEqual('event-2');
        expect(events[1].session_id).toEqual(950);
        expect(events[1].time).toEqual(1050);

        expect(events[2].event_type).toEqual('event-3');
        expect(events[2].session_id).toEqual(1200);
        expect(events[2].time).toEqual(1200);

        expect(events[3].event_type).toEqual('event-4');
        expect(events[3].session_id).toEqual(1350);
        expect(events[3].time).toEqual(1350);

        expect(events[4].event_type).toEqual('event-5');
        expect(events[4].session_id).toEqual(1500);
        expect(events[4].time).toEqual(1700);

        expect(events[5].event_type).toEqual('event-6');
        expect(events[5].session_id).toEqual(1500);
        expect(events[5].time).toEqual(1750);

        expect(events[6].event_type).toEqual('event-7');
        expect(events[6].session_id).toEqual(2000);
        expect(events[6].time).toEqual(2000);

        expect(events[7].event_type).toEqual('event-8');
        expect(events[7].session_id).toEqual(2000);
        expect(events[7].time).toEqual(2200);
      });

      test('should use explicit session ids and do not track session_start/session_end events', async () => {
        const send = jest.fn().mockReturnValue(sendResponse);
        const client = new AmplitudeReactNativeTest(950);
        const cookieStorage = new core.MemoryStorage<UserSession>();
        await cookieStorage.set(getStorageKey(API_KEY), { sessionId: 500, lastEventTime: 850, optOut: false });

        await client.init(API_KEY, undefined, clientOptions(send, cookieStorage, false, 1000)).promise;

        void client.track({ event_type: 'event-1', time: 1000 });
        void client.track({ event_type: 'event-2', time: 1050 });

        client.currentTime = 1100;
        client.setSessionId(5000);

        void client.track({ event_type: 'event-3', time: 1200 });
        void client.track({ event_type: 'event-4', time: 1350 });

        client.setActive(1500);

        void client.track({ event_type: 'event-5', time: 1700 });

        client.currentTime = 1720;
        client.setSessionId(5050);

        client.setBackground(1730);

        void client.track({ event_type: 'event-6', time: 1750 });
        void client.track({ event_type: 'event-7', time: 2000 });

        client.setActive(2050);

        await client.track({ event_type: 'event-8', time: 2200 }).promise;

        client.setSessionId(6000);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const events = send.mock.calls.flatMap((call) => call[1].events as Event[]);
        expect(events.length).toEqual(8);
        events.forEach((event, i) => expect(event.event_id).toEqual(i + 1));

        expect(events[0].event_type).toEqual('event-1');
        expect(events[0].session_id).toEqual(1000);
        expect(events[0].time).toEqual(1000);

        expect(events[1].event_type).toEqual('event-2');
        expect(events[1].session_id).toEqual(1000);
        expect(events[1].time).toEqual(1050);

        expect(events[2].event_type).toEqual('event-3');
        expect(events[2].session_id).toEqual(5000);
        expect(events[2].time).toEqual(1200);

        expect(events[3].event_type).toEqual('event-4');
        expect(events[3].session_id).toEqual(5000);
        expect(events[3].time).toEqual(1350);

        expect(events[4].event_type).toEqual('event-5');
        expect(events[4].session_id).toEqual(5000);
        expect(events[4].time).toEqual(1700);

        expect(events[5].event_type).toEqual('event-6');
        expect(events[5].session_id).toEqual(5050);
        expect(events[5].time).toEqual(1750);

        expect(events[6].event_type).toEqual('event-7');
        expect(events[6].session_id).toEqual(5050);
        expect(events[6].time).toEqual(2000);

        expect(events[7].event_type).toEqual('event-8');
        expect(events[7].session_id).toEqual(5050);
        expect(events[7].time).toEqual(2200);
      });
    });
  });
});
