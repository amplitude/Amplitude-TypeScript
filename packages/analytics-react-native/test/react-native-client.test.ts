import { AmplitudeReactNative } from '../src/react-native-client';
import * as core from '@amplitude/analytics-core';
import * as CookieMigration from '../src/cookie-migration';
import { Status, UserSession } from '@amplitude/analytics-types';
import { isWeb } from '../src/utils/platform';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAnalyticsConnector } from '@amplitude/analytics-client-common';
import * as Config from '../src/config';

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
      });
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
      });
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
        }),
        client.init(API_KEY, USER_ID, {
          ...attributionConfig,
        }),
        client.init(API_KEY, USER_ID, {
          ...attributionConfig,
        }),
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
      });
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).toBe(1);
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
      await client.init(API_KEY, USER_ID);
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
      });
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(runAttributionStrategy).toHaveBeenCalledTimes(1);
    });

    test('should set user id and device id in analytics connector', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
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
      });
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
      });
      const track = jest.spyOn(client, 'track').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
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
        const track = jest.spyOn(client, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );
        await client.init(API_KEY, USER_ID, {
          attribution: {
            disabled: false,
          },
        });
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
      });
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
      });
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
          .then(() => {
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
      });
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
      });
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
          .then(() => {
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
      await client.init(API_KEY);
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
      });
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
      });
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
          .then(() => {
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
      });
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
      });
      const identifyObject = new core.Identify();
      const result = await client.identify(identifyObject, { user_id: '123' });
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
      });
      const identifyObject = new core.Identify();
      const result = await client.groupIdentify('g', '1', identifyObject);
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
      });
      const revenueObject = new core.Revenue();
      const result = await client.revenue(revenueObject);
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
