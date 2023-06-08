import { AmplitudeBrowser } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as CookieMigration from '../src/cookie-migration';
import { UserSession } from '@amplitude/analytics-types';
import {
  CookieStorage,
  FetchTransport,
  getAnalyticsConnector,
  getCookieName,
} from '@amplitude/analytics-client-common';
import * as SnippetHelper from '../src/utils/snippet-helper';
import * as fileDownloadTracking from '../src/plugins/file-download-tracking';
import * as formInteractionTracking from '../src/plugins/form-interaction-tracking';
import * as webAttributionPlugin from '@amplitude/plugin-web-attribution-browser';

describe('browser-client', () => {
  let apiKey = '';
  let userId = '';
  let deviceId = '';
  let client = new AmplitudeBrowser();
  const defaultTracking = {
    attribution: false,
    fileDownloadTracking: false,
    formInteractionTracking: false,
    pageViews: false,
    sessions: false,
  };

  beforeEach(() => {
    client = new AmplitudeBrowser();
    apiKey = core.UUID();
    userId = core.UUID();
    deviceId = core.UUID();
  });

  afterEach(() => {
    // clean up cookies
    document.cookie = `AMP_${apiKey}=null; expires=-1`;
  });

  describe('init', () => {
    test('should initialize client', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      await client.init(apiKey, userId, {
        defaultTracking,
        identityStorage: 'localStorage',
      }).promise;
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should initialize w/o user id and config', async () => {
      client.setOptOut(true);
      await client.init(apiKey).promise;
      expect(client.getUserId()).toBe(undefined);
    });

    test('should set initalize with undefined user id', async () => {
      client.setOptOut(true);
      await client.init(apiKey, undefined).promise;
      expect(client.getUserId()).toBe(undefined);
    });

    test('should initialize w/o config', async () => {
      client.setOptOut(true);
      await client.init(apiKey, userId).promise;
      expect(client.getUserId()).toBe(userId);
    });

    test('should set user id with top level parameter', async () => {
      client.setOptOut(true);
      await client.init(apiKey, undefined, {
        userId,
      }).promise;
      expect(client.getUserId()).toBe(undefined);
    });

    test('should set user to options.userId', async () => {
      client.setOptOut(true);
      await client.init(apiKey, {
        userId,
      }).promise;
      expect(client.getUserId()).toBe(userId);
    });

    test('should set user id using top level parameter as priority', async () => {
      client.setOptOut(true);
      await client.init(apiKey, userId, {
        userId: 'user@amplitude.com',
      }).promise;
      expect(client.getUserId()).toBe(userId);
    });

    test('should initialize with existing session', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        lastEventTime: Date.now(),
      });
      await client.init(apiKey, userId, {
        sessionId: Date.now(),
        defaultTracking,
      }).promise;
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should initialize without error when apiKey is undefined', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await client.init(undefined as any, userId, {
        defaultTracking,
      }).promise;
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should init from legacy cookies config', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        deviceId,
        sessionId: 1,
        lastEventTime: Date.now() - 1000,
      });
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking,
        identityStorage: 'none',
      }).promise;
      expect(client.getDeviceId()).toBe(deviceId);
      expect(client.getSessionId()).toBe(1);
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should init from new cookies config', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const cookieStorage = new CookieStorage<UserSession>();
      await cookieStorage.set(getCookieName(apiKey), {
        deviceId,
        lastEventTime: Date.now(),
        optOut: false,
        sessionId: 1,
        userId,
      });
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      expect(client.getUserId()).toBe(userId);
      expect(client.getDeviceId()).toBe(deviceId);
      expect(client.getSessionId()).toBe(1);
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should call prevent concurrent init executions', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const useBrowserConfig = jest.spyOn(Config, 'useBrowserConfig');
      await Promise.all([
        client.init(apiKey, userId, { defaultTracking }).promise,
        client.init(apiKey, userId, { defaultTracking }).promise,
        client.init(apiKey, userId, { defaultTracking }).promise,
      ]);
      // NOTE: `parseLegacyCookies` and `useBrowserConfig` are only called once despite multiple init calls
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
      expect(useBrowserConfig).toHaveBeenCalledTimes(1);
    });

    test('should set user id and device id in analytics connector', async () => {
      await client.init(apiKey, userId, {
        optOut: true,
        defaultTracking,
        deviceId,
        identityStorage: 'none',
      }).promise;
      expect(client.getDeviceId()).toBe(deviceId);
      expect(client.getUserId()).toBe(userId);
      const identity = getAnalyticsConnector().identityStore.getIdentity();
      expect(identity.deviceId).toBe(deviceId);
      expect(identity.userId).toBe(userId);
    });

    test('should set up event bridge and track events', async () => {
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking,
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

    test('should add file download and form interaction tracking plugins', async () => {
      const fileDownloadTrackingPlugin = jest.spyOn(fileDownloadTracking, 'fileDownloadTracking');
      const formInteractionTrackingPlugin = jest.spyOn(formInteractionTracking, 'formInteractionTracking');
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking: {
          ...defaultTracking,
          fileDownloads: true,
          formInteractions: true,
        },
      }).promise;
      expect(fileDownloadTrackingPlugin).toHaveBeenCalledTimes(1);
      expect(formInteractionTrackingPlugin).toHaveBeenCalledTimes(1);
    });

    test('should NOT add file download and form interaction tracking plugins', async () => {
      const fileDownloadTrackingPlugin = jest.spyOn(fileDownloadTracking, 'fileDownloadTracking');
      const formInteractionTrackingPlugin = jest.spyOn(formInteractionTracking, 'formInteractionTracking');
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking: {
          ...defaultTracking,
          fileDownloads: false,
          formInteractions: false,
        },
      }).promise;
      expect(fileDownloadTrackingPlugin).toHaveBeenCalledTimes(0);
      expect(formInteractionTrackingPlugin).toHaveBeenCalledTimes(0);
    });

    test('should add web attribution tracking plugin', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        lastEventTime: Date.now(),
      });
      const webAttributionPluginPlugin = jest.spyOn(webAttributionPlugin, 'webAttributionPlugin');
      jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking: {
          ...defaultTracking,
          attribution: {},
        },
        sessionId: Date.now(),
      }).promise;
      expect(webAttributionPluginPlugin).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserId', () => {
    test('should get user id', async () => {
      await client.init(apiKey, userId, { defaultTracking }).promise;
      expect(client.getUserId()).toBe(userId);
    });

    test('should handle undefined config', async () => {
      expect(client.getUserId()).toBe(undefined);
    });
  });

  describe('setUserId', () => {
    test('should set user id', async () => {
      await client.init(apiKey, { defaultTracking }).promise;
      expect(client.getUserId()).toBe(undefined);
      client.setUserId(userId);
      expect(client.getUserId()).toBe(userId);
    });

    test('should not set user id', async () => {
      const setSessionId = jest.spyOn(client, 'setSessionId');
      await client.init(apiKey, userId, { defaultTracking }).promise;

      // Reset mock to isolate mock for `setUserId(...)` call
      // `setUserId(...)` may have been called on `init(...)`
      // We do not want to depend on init behavior
      setSessionId.mockReset();

      expect(client.getUserId()).toBe(userId);
      client.setUserId(userId);
      expect(setSessionId).toHaveBeenCalledTimes(0);
      expect(client.getUserId()).toBe(userId);
    });

    test('should set user and session id with start and end session event', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventTime: Date.now() - 1000,
      });
      const result = {
        promise: Promise.resolve({
          code: 200,
          event: {
            event_type: 'a',
          },
          message: 'success',
        }),
      };
      const track = jest.spyOn(client, 'track').mockReturnValue(result);
      await client.init(apiKey, userId, {
        sessionTimeout: 5000,
        defaultTracking: {
          ...defaultTracking,
          sessions: true,
        },
      }).promise;

      // Reset mock to isolate mock for `track(...)` call
      // `track(...)` may have been called on `init(...)`
      // We do not want to depend on init behavior
      track.mockReset();

      client.setUserId(undefined);
      expect(client.getUserId()).toBe(undefined);
      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should defer set user id', () => {
      return new Promise<void>((resolve) => {
        void client.init(apiKey, { defaultTracking }).promise.then(() => {
          expect(client.getUserId()).toBe('user@amplitude.com');
          resolve();
        });
        client.setUserId('user@amplitude.com');
      });
    });

    test('should be able to unset user id to undefined', async () => {
      await client.init(apiKey, userId, {
        defaultTracking,
        deviceId,
      }).promise;
      expect(client.getUserId()).toBe(userId);
      expect(client.getDeviceId()).toBe(deviceId);

      client.setUserId(undefined);
      expect(client.getUserId()).toBe(undefined);
      expect(client.getDeviceId()).toBe(deviceId);
    });

    test('should be able to unset user id to undefined after setUserId()', async () => {
      await client.init(apiKey, {
        defaultTracking,
        deviceId,
      }).promise;
      expect(client.getUserId()).toBe(undefined);
      expect(client.getDeviceId()).toBe(deviceId);

      client.setUserId(userId);
      expect(client.getUserId()).toBe(userId);
      expect(client.getDeviceId()).toBe(deviceId);

      client.setUserId(undefined);
      expect(client.getUserId()).toBe(undefined);
      expect(client.getDeviceId()).toBe(deviceId);
    });
  });

  describe('getDeviceId', () => {
    test('should get device id', async () => {
      await client.init(apiKey, {
        defaultTracking,
        deviceId,
      }).promise;
      expect(client.getDeviceId()).toBe(deviceId);
    });

    test('should handle undefined config', async () => {
      expect(client.getDeviceId()).toBe(undefined);
    });
  });

  describe('setDeviceId', () => {
    test('should set device id config', async () => {
      await client.init(apiKey, { defaultTracking }).promise;
      client.setDeviceId(deviceId);
      expect(client.getDeviceId()).toBe(deviceId);
    });

    test('should defer set device id', () => {
      return new Promise<void>((resolve) => {
        void client.init(apiKey, { defaultTracking }).promise.then(() => {
          expect(client.getDeviceId()).toBe('asdfg');
          resolve();
        });
        client.setDeviceId('asdfg');
      });
    });
  });

  describe('reset', () => {
    test('should reset user id and generate new device id config', async () => {
      await client.init(apiKey, { defaultTracking }).promise;
      client.setUserId(userId);
      client.setDeviceId(deviceId);
      expect(client.getUserId()).toBe(userId);
      expect(client.getDeviceId()).toBe(deviceId);
      client.reset();
      expect(client.getUserId()).toBe(undefined);
      expect(client.getDeviceId()).not.toBe(deviceId);
    });
  });

  describe('getSessionId', () => {
    test('should get session id', async () => {
      await client.init(apiKey, {
        defaultTracking,
        sessionId: 1,
      }).promise;
      expect(client.getSessionId()).toBe(1);
    });

    test('should handle undefined config', async () => {
      expect(client.getSessionId()).toBe(undefined);
    });
  });

  describe('setSessionId', () => {
    test('should set session id', async () => {
      await client.init(apiKey, { defaultTracking }).promise;
      client.setSessionId(1);
      expect(client.getSessionId()).toBe(1);
    });

    test('should set session id with start session event', async () => {
      const result = {
        promise: Promise.resolve({
          code: 200,
          event: {
            event_type: 'a',
          },
          message: 'success',
        }),
      };
      const track = jest.spyOn(client, 'track').mockReturnValue(result);
      await client.init(apiKey, {
        sessionId: 1,
        defaultTracking: {
          ...defaultTracking,
          attribution: false,
          pageViews: false,
          sessions: true,
        },
      }).promise;
      client.setSessionId(2);
      expect(client.getSessionId()).toBe(2);
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should set session id with start and end session event', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventTime: Date.now() - 1000,
      });
      const result = {
        promise: Promise.resolve({
          code: 200,
          event: {
            event_type: 'a',
          },
          message: 'success',
        }),
      };
      const track = jest.spyOn(client, 'track').mockReturnValue(result);
      await client.init(apiKey, {
        sessionTimeout: 5000,
        defaultTracking: {
          ...defaultTracking,
          attribution: false,
          pageViews: false,
          sessions: true,
        },
      }).promise;
      client.setSessionId(2);
      expect(client.getSessionId()).toBe(2);
      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should defer set session id', () => {
      return new Promise<void>((resolve) => {
        void client.init(apiKey, { defaultTracking }).promise.then(() => {
          expect(client.getSessionId()).toBe(1);
          resolve();
        });
        client.setSessionId(1);
      });
    });
  });

  describe('setTransport', () => {
    test('should set transport', async () => {
      const fetch = new FetchTransport();
      const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(fetch);
      await client.init(apiKey, { defaultTracking }).promise;
      client.setTransport('fetch');
      expect(createTransport).toHaveBeenCalledTimes(2);
    });

    test('should defer set transport', () => {
      return new Promise<void>((resolve) => {
        const fetch = new FetchTransport();
        const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(fetch);
        void client.init(apiKey, { defaultTracking }).promise.then(() => {
          expect(createTransport).toHaveBeenCalledTimes(2);
          resolve();
        });
        client.setTransport('fetch');
      });
    });
  });

  describe('identify', () => {
    test('should track identify', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const identifyObject = new core.Identify();
      const result = await client.identify(identifyObject, { user_id: '123', device_id: '123' }).promise;
      expect(result.code).toEqual(200);
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should track identify using proxy', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(new core.Identify());
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const identifyObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.identify(identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(track).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('groupIdentify', () => {
    test('should track group identify', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const identifyObject = new core.Identify();
      const result = await client.groupIdentify('g', '1', identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should track group identify using proxy', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(new core.Identify());
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const identifyObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.groupIdentify('g', '1', identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(track).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('revenue', () => {
    test('should track revenue', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const revenueObject = new core.Revenue();
      const result = await client.revenue(revenueObject).promise;
      expect(result.code).toEqual(200);
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should track revenue using proxy', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValueOnce(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(new core.Revenue());
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const revenueObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.revenue(revenueObject).promise;
      expect(result.code).toEqual(200);
      expect(track).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
    });
  });
});
