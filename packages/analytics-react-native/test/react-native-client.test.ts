import { AmplitudeReactNative } from '../src/react-native-client';
import * as core from '@amplitude/analytics-core';
import { ampCapture } from '../src/amp-capture';
import * as CookieMigration from '../src/cookie-migration';
import {
  Status,
  UserSession,
  Event,
  getAnalyticsConnector,
  getCookieName as getStorageKey,
} from '@amplitude/analytics-core';
import { AppState } from 'react-native';
import { isWeb } from '../src/utils/platform';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Config from '../src/config';
import * as NetworkChecker from '../src/plugins/network-connectivity-checker';
import {
  DEFAULT_APPLICATION_BACKGROUNDED_EVENT,
  DEFAULT_APPLICATION_OPENED_EVENT,
  DEFAULT_ELEMENT_INTERACTED_EVENT,
  DEFAULT_SCREEN_VIEWED_EVENT,
  DEFAULT_SESSION_END_EVENT,
  DEFAULT_SESSION_START_EVENT,
  SCREEN_NAME,
  TARGET_ACCESSIBILITY_LABEL,
  TARGET_ACTION,
  TARGET_COMPONENT,
  TARGET_ELEMENT,
  TARGET_TEST_ID,
} from '../src/constants';

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
    // clean up cookies (web-only — RN has no `document`)
    if (typeof document !== 'undefined') {
      document.cookie = 'AMP_API_KEY=null; expires=-1';
    }
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

    test('should remove previous app state listener when re-init', async () => {
      jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValue({ optOut: false });

      const client = new AmplitudeReactNative();
      await client.init(API_KEY, USER_ID, { ...attributionConfig }).promise;

      const remove = jest.fn();
      (client as any).appStateChangeHandler = { remove };

      await client.init(API_KEY, USER_ID, { ...attributionConfig }).promise;
      expect(remove).toHaveBeenCalledTimes(1);
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

  describe('network connectivity checker plugin', () => {
    const NETWORK_CHECKER_PLUGIN_NAME = '@amplitude/plugin-network-checker-react-native';

    let installSpy: jest.SpyInstance;
    let client: AmplitudeReactNative;
    let addSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({ optOut: false });
      installSpy = jest.spyOn(NetworkChecker, 'networkConnectivityCheckerPlugin');
      client = new AmplitudeReactNative();
      addSpy = jest.spyOn(client, 'add');
    });

    afterEach(() => {
      installSpy.mockRestore();
    });

    test('should install the network connectivity checker by default', async () => {
      await client.init(API_KEY, USER_ID, { ...attributionConfig }).promise;
      expect(installSpy).toHaveBeenCalledTimes(1);
      // Assert it actually lands in the timeline under the expected name.
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ name: NETWORK_CHECKER_PLUGIN_NAME }));
    });

    test('should not install the network connectivity checker when offline is OfflineDisabled', async () => {
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
        offline: core.OfflineDisabled,
      }).promise;
      expect(installSpy).not.toHaveBeenCalled();
      // And it never reaches the timeline.
      expect(addSpy).not.toHaveBeenCalledWith(expect.objectContaining({ name: NETWORK_CHECKER_PLUGIN_NAME }));
    });
  });

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
    }, 10000);
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

  describe('autocapture', () => {
    let client: AmplitudeReactNative;
    let trackSpy: jest.SpyInstance;

    const sendResponse = {
      status: Status.Success,
      statusCode: 200,
      body: {
        eventsIngested: 1,
        payloadSizeBytes: 1,
        serverUploadTime: 1,
      },
    };

    const initOptions = (
      autocapture: boolean | { sessions?: boolean; appLifecycles?: boolean; elementInteractions?: boolean },
    ) => ({
      autocapture,
      transportProvider: {
        send: jest.fn().mockResolvedValue(sendResponse),
      },
      ...attributionConfig,
    });

    describe('sessions', () => {
      beforeEach(() => {
        client = new AmplitudeReactNative();
        trackSpy = jest.spyOn(client, 'track');
      });

      afterEach(() => {
        trackSpy.mockClear();
      });

      describe('should track', () => {
        test('when autocapture is true', async () => {
          await client.init(API_KEY, undefined, initOptions(true)).promise;
          expect(trackSpy).toHaveBeenCalledWith({
            event_type: DEFAULT_SESSION_START_EVENT,
            time: expect.any(Number),
            session_id: expect.any(Number),
          });
          // Force a session change; track() does not start sessions while appState is active
          client.setSessionId(client.config.sessionId! + 1);
          expect(trackSpy).toHaveBeenCalledWith({
            event_type: DEFAULT_SESSION_END_EVENT,
            time: expect.any(Number),
            session_id: expect.any(Number),
          });
        });

        test('when autocapture is object and .sessions is true', async () => {
          await client.init(API_KEY, undefined, initOptions({ sessions: true })).promise;
          expect(trackSpy).toHaveBeenCalledWith({
            event_type: DEFAULT_SESSION_START_EVENT,
            time: expect.any(Number),
            session_id: expect.any(Number),
          });
          // Force a session change; track() does not start sessions while appState is active
          client.setSessionId(client.config.sessionId! + 1);
          expect(trackSpy).toHaveBeenCalledWith({
            event_type: DEFAULT_SESSION_END_EVENT,
            time: expect.any(Number),
            session_id: expect.any(Number),
          });
        });
      });

      describe('should not track', () => {
        test('when autocapture is false', async () => {
          await client.init(API_KEY, undefined, initOptions(false)).promise;
          expect(trackSpy).not.toHaveBeenCalled();
        });

        test('when autocapture is object and .sessions is false', async () => {
          await client.init(API_KEY, undefined, initOptions({ sessions: false })).promise;
          expect(trackSpy).not.toHaveBeenCalled();
        });
      });
    });

    describe('appLifecycles', () => {
      const originalAppState = AppState.currentState;

      beforeEach(() => {
        client = new AmplitudeReactNative();
        trackSpy = jest.spyOn(client, 'track');
        AppState.currentState = 'active';
      });

      afterEach(() => {
        trackSpy.mockClear();
        AppState.currentState = originalAppState;
      });

      test('should track Application Opened on init when app is already active', async () => {
        await client.init(API_KEY, undefined, initOptions({ appLifecycles: true })).promise;
        expect(trackSpy).toHaveBeenCalledWith('[Amplitude] Application Opened');
      });

      test('should not track Application Opened on init when app is background', async () => {
        AppState.currentState = 'background';
        await client.init(API_KEY, undefined, initOptions({ appLifecycles: true })).promise;
        expect(trackSpy).not.toHaveBeenCalledWith('[Amplitude] Application Opened');
      });

      test('should track appLifecycles when it is enabled', async () => {
        await client.init(API_KEY, undefined, initOptions({ appLifecycles: true })).promise;
        (client as any).handleAppStateChange('background');
        expect(trackSpy).toHaveBeenCalledWith(DEFAULT_APPLICATION_BACKGROUNDED_EVENT);
        (client as any).handleAppStateChange('active');
        expect(trackSpy).toHaveBeenCalledWith(DEFAULT_APPLICATION_OPENED_EVENT);
      });

      test('should track Application Opened after background → inactive → active', async () => {
        await client.init(API_KEY, undefined, initOptions({ appLifecycles: true })).promise;
        trackSpy.mockClear();
        (client as any).handleAppStateChange('background');
        (client as any).handleAppStateChange('inactive');
        (client as any).handleAppStateChange('active');
        expect(trackSpy).toHaveBeenCalledWith(DEFAULT_APPLICATION_BACKGROUNDED_EVENT);
        expect(trackSpy).toHaveBeenCalledWith(DEFAULT_APPLICATION_OPENED_EVENT);
      });

      test('should not track Application Opened on inactive → active without background', async () => {
        await client.init(API_KEY, undefined, initOptions({ appLifecycles: true })).promise;
        // App is typically active after init; simulate iOS overlay (Control Center).
        (client as any).appState = 'active';
        (client as any).wasBackgrounded = false;
        trackSpy.mockClear();

        (client as any).handleAppStateChange('inactive');
        (client as any).handleAppStateChange('active');

        expect(trackSpy).not.toHaveBeenCalledWith(DEFAULT_APPLICATION_BACKGROUNDED_EVENT);
        expect(trackSpy).not.toHaveBeenCalledWith(DEFAULT_APPLICATION_OPENED_EVENT);
      });

      test('should not track Application Opened after re-init when background happened with appLifecycles off', async () => {
        await client.init(API_KEY, undefined, initOptions({ appLifecycles: false })).promise;
        (client as any).handleAppStateChange('background');
        expect(trackSpy).not.toHaveBeenCalledWith(DEFAULT_APPLICATION_BACKGROUNDED_EVENT);

        await client.init(API_KEY, undefined, initOptions({ appLifecycles: true })).promise;
        trackSpy.mockClear();
        (client as any).appState = 'background';
        (client as any).handleAppStateChange('active');

        expect(trackSpy).not.toHaveBeenCalledWith(DEFAULT_APPLICATION_OPENED_EVENT);
      });
    });

    describe('elementInteractions', () => {
      beforeEach(() => {
        client = new AmplitudeReactNative();
        trackSpy = jest.spyOn(client, 'track');
      });

      afterEach(() => {
        trackSpy.mockClear();
        jest.restoreAllMocks();
      });

      test('should not track element interactions twice when re-init with elementInteractions', async () => {
        await client.init(API_KEY, undefined, initOptions({ elementInteractions: true })).promise;
        await client.init(API_KEY, undefined, initOptions({ elementInteractions: true })).promise;
        trackSpy.mockClear();

        const properties = {
          accessibilityLabel: 'Button accessibility label',
          testID: 'my-button',
          component: 'ButtonHarness',
          element: 'Button',
          action: 'onPress',
        };
        ampCapture(jest.fn(), properties)();

        expect(trackSpy).toHaveBeenCalledTimes(1);
        expect(trackSpy).toHaveBeenCalledWith(DEFAULT_ELEMENT_INTERACTED_EVENT, {
          [SCREEN_NAME]: undefined,
          [TARGET_ACCESSIBILITY_LABEL]: 'Button accessibility label',
          [TARGET_ACTION]: 'onPress',
          [TARGET_COMPONENT]: 'ButtonHarness',
          [TARGET_ELEMENT]: 'Button',
          [TARGET_TEST_ID]: 'my-button',
        });
      });

      test('should not attach stale screen name to element interactions after re-init', async () => {
        await client.init(API_KEY, undefined, initOptions({ elementInteractions: true })).promise;
        client.trackScreenView('Home');
        await client.init(API_KEY, undefined, initOptions({ elementInteractions: true })).promise;
        trackSpy.mockClear();

        ampCapture(jest.fn(), { testID: 'my-button' })();

        expect(trackSpy).toHaveBeenCalledWith(
          DEFAULT_ELEMENT_INTERACTED_EVENT,
          expect.objectContaining({
            [SCREEN_NAME]: undefined,
          }),
        );
      });

      test('should not attach stale screen name to element interactions after reset', async () => {
        await client.init(API_KEY, undefined, initOptions({ elementInteractions: true })).promise;
        client.trackScreenView('Home');
        client.reset();
        trackSpy.mockClear();

        ampCapture(jest.fn(), { testID: 'my-button' })();

        expect(trackSpy).toHaveBeenCalledWith(
          DEFAULT_ELEMENT_INTERACTED_EVENT,
          expect.objectContaining({
            [SCREEN_NAME]: undefined,
          }),
        );
      });
    });

    describe('re-init', () => {
      beforeEach(() => {
        client = new AmplitudeReactNative();
        trackSpy = jest.spyOn(client, 'track');
      });

      afterEach(() => {
        trackSpy.mockClear();
      });

      test('should clear previous autocapture flags when re-init omits or disables autocapture', async () => {
        await client.init(API_KEY, undefined, initOptions({ sessions: true, appLifecycles: true })).promise;
        expect(client.autocapture).toEqual({ sessions: true, appLifecycles: true });

        await client.init(API_KEY, undefined, initOptions(false)).promise;
        expect(client.autocapture).toBeNull();

        await client.init(API_KEY, undefined, initOptions({ sessions: true, appLifecycles: true })).promise;
        expect(client.autocapture).toEqual({ sessions: true, appLifecycles: true });

        await client.init(API_KEY, undefined, {
          transportProvider: {
            send: jest.fn().mockResolvedValue(sendResponse),
          },
          ...attributionConfig,
        }).promise;
        expect(client.autocapture).toBeNull();
      });
    });
  });

  describe('trackScreenView', () => {
    test('should track screen viewed with screen name property', async () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      client.trackScreenView('Home', { category: 'main' });
      expect(track).toHaveBeenCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'Home',
          category: 'main',
        },
        undefined,
      );
    });
  });

  describe('trackScreenViewOnNavigationStateChange', () => {
    test('should track root route name for flat navigation state', async () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      client.trackScreenViewOnNavigationStateChange({
        index: 0,
        routes: [{ name: 'Home' }],
      });
      expect(track).toHaveBeenCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'Home',
        },
        undefined,
      );
    });

    test('should track focused leaf route name for nested navigation state', async () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      client.trackScreenViewOnNavigationStateChange({
        index: 0,
        routes: [
          {
            name: 'Main',
            state: {
              index: 1,
              routes: [
                { name: 'Home' },
                {
                  name: 'Profile',
                  state: {
                    index: 0,
                    routes: [{ name: 'ProfileDetails' }],
                  },
                },
              ],
            },
          },
        ],
      });
      expect(track).toHaveBeenCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'ProfileDetails',
        },
        undefined,
      );
    });

    test('should no-op when navigation state is undefined', async () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      expect(await client.trackScreenViewOnNavigationStateChange(undefined).promise).toBe(undefined);
      expect(track).not.toHaveBeenCalled();
    });

    test('should track initial route from onReady and dedupe the same route on onStateChange', () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      const homeState = {
        index: 0,
        routes: [{ name: 'Home' }],
      };

      // onReady: React Navigation does not invoke onStateChange for the initial route.
      client.trackScreenViewOnNavigationStateChange(homeState);
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'Home',
        },
        undefined,
      );

      // A later onStateChange for the same focused route must not double-count.
      client.trackScreenViewOnNavigationStateChange(homeState);
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should not track duplicate screen views for the same focused route', () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      const homeState = {
        index: 0,
        routes: [{ name: 'Home' }],
      };

      client.trackScreenViewOnNavigationStateChange(homeState);
      client.trackScreenViewOnNavigationStateChange(homeState);
      expect(track).toHaveBeenCalledTimes(1);

      client.trackScreenViewOnNavigationStateChange({
        index: 0,
        routes: [{ name: 'Settings' }],
      });
      expect(track).toHaveBeenCalledTimes(2);
      expect(track).toHaveBeenLastCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'Settings',
        },
        undefined,
      );

      // Returning to a previously viewed screen should track again.
      client.trackScreenViewOnNavigationStateChange(homeState);
      expect(track).toHaveBeenCalledTimes(3);
      expect(track).toHaveBeenLastCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'Home',
        },
        undefined,
      );
    });

    test('should track the same focused route again after reset', () => {
      const client = new AmplitudeReactNative();
      const track = jest.spyOn(client, 'track');
      const homeState = {
        index: 0,
        routes: [{ name: 'Home' }],
      };

      client.trackScreenViewOnNavigationStateChange(homeState);
      expect(track).toHaveBeenCalledTimes(1);

      client.reset();
      client.trackScreenViewOnNavigationStateChange(homeState);
      expect(track).toHaveBeenCalledTimes(2);
      expect(track).toHaveBeenLastCalledWith(
        DEFAULT_SCREEN_VIEWED_EVENT,
        {
          [SCREEN_NAME]: 'Home',
        },
        undefined,
      );
    });
  });
});
