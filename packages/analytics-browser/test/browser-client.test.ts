import { AmplitudeBrowser } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as CookieMigration from '../src/cookie-migration';
import { Status, TransportType, UserSession } from '@amplitude/analytics-types';
import { FetchTransport, getAnalyticsConnector } from '@amplitude/analytics-client-common';
import * as SnippetHelper from '../src/utils/snippet-helper';
import * as fileDownloadTracking from '../src/plugins/file-download-tracking';
import * as formInteractionTracking from '../src/plugins/form-interaction-tracking';
import * as webAttributionPlugin from '@amplitude/plugin-web-attribution-browser';
import * as pageViewTrackingPlugin from '@amplitude/plugin-page-view-tracking-browser';

describe('browser-client', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';
  const DEVICE_ID = 'DEVICE_ID';
  const attributionConfig = {
    attribution: {
      disabled: true,
    },
  };

  afterEach(() => {
    // clean up cookies
    document.cookie = 'AMP_API_KEY=null; expires=-1';
  });

  describe('init', () => {
    test('should initialize client', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        disableCookies: true,
        ...attributionConfig,
      }).promise;
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should initialize with existing session', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        lastEventTime: Date.now(),
      });
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        sessionId: Date.now(),
      }).promise;
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should initialize without error when apiKey is undefined', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeBrowser();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await client.init(undefined as any, USER_ID, {
        ...attributionConfig,
      }).promise;
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should init from legacy cookies config', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        deviceId: DEVICE_ID,
        sessionId: 1,
        lastEventTime: Date.now() - 1000,
      });
      const cookieStorage = new core.MemoryStorage<UserSession>();
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        cookieStorage,
        ...attributionConfig,
      }).promise;
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).toBe(1);
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should init from new cookies config', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const cookieStorage = new core.MemoryStorage<UserSession>();
      jest.spyOn(cookieStorage, 'set').mockResolvedValue(undefined);
      jest.spyOn(cookieStorage, 'get').mockResolvedValue({
        sessionId: 1,
        deviceId: DEVICE_ID,
        optOut: false,
        lastEventTime: Date.now(),
        userId: USER_ID,
      });
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        cookieStorage,
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(USER_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).toBe(1);
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
    });

    test('should call prevent concurrent init executions', async () => {
      const parseLegacyCookies = jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const useBrowserConfig = jest.spyOn(Config, 'useBrowserConfig');
      const client = new AmplitudeBrowser();
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
      // NOTE: `parseLegacyCookies` and `useBrowserConfig` are only called once despite multiple init calls
      expect(parseLegacyCookies).toHaveBeenCalledTimes(1);
      expect(useBrowserConfig).toHaveBeenCalledTimes(1);
    });

    test('should set user id and device id in analytics connector', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      jest.spyOn(cookieStorage, 'set').mockResolvedValue(undefined);
      jest.spyOn(cookieStorage, 'get').mockResolvedValueOnce(undefined).mockResolvedValue({
        sessionId: 1,
        deviceId: DEVICE_ID,
        optOut: false,
      });
      const client = new AmplitudeBrowser();
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
      const client = new AmplitudeBrowser();
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

    test('should add page view tracking with default event type', async () => {
      const client = new AmplitudeBrowser();
      const pageViewTracking = jest.spyOn(pageViewTrackingPlugin, 'pageViewTrackingPlugin');
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        ...attributionConfig,
        defaultTracking: {
          pageViews: {},
        },
      }).promise;
      expect(pageViewTracking).toHaveBeenCalledTimes(1);
      expect(pageViewTracking).toHaveBeenNthCalledWith(1, {
        eventType: '[Amplitude] Page Viewed',
      });
    });

    test('should add file download and form interaction tracking plugins', async () => {
      const client = new AmplitudeBrowser();
      const fileDownloadTrackingPlugin = jest.spyOn(fileDownloadTracking, 'fileDownloadTracking');
      const formInteractionTrackingPlugin = jest.spyOn(formInteractionTracking, 'formInteractionTracking');
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        ...attributionConfig,
        defaultTracking: {
          fileDownloads: true,
          formInteractions: true,
        },
      }).promise;
      expect(fileDownloadTrackingPlugin).toHaveBeenCalledTimes(1);
      expect(formInteractionTrackingPlugin).toHaveBeenCalledTimes(1);
    });

    test('should NOT add file download and form interaction tracking plugins', async () => {
      const client = new AmplitudeBrowser();
      const fileDownloadTrackingPlugin = jest.spyOn(fileDownloadTracking, 'fileDownloadTracking');
      const formInteractionTrackingPlugin = jest.spyOn(formInteractionTracking, 'formInteractionTracking');
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        ...attributionConfig,
      }).promise;
      expect(fileDownloadTrackingPlugin).toHaveBeenCalledTimes(0);
      expect(formInteractionTrackingPlugin).toHaveBeenCalledTimes(0);
    });

    test('should add web attribution tracking plugin', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        lastEventTime: Date.now(),
      });
      const client = new AmplitudeBrowser();
      const webAttributionPluginPlugin = jest.spyOn(webAttributionPlugin, 'webAttributionPlugin');
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        attribution: {},
        sessionId: Date.now(),
        transportProvider: {
          send: async () => ({
            status: Status.Success,
            statusCode: 200,
            body: {
              eventsIngested: 0,
              payloadSizeBytes: 0,
              serverUploadTime: 0,
            },
          }),
        },
      }).promise;
      expect(webAttributionPluginPlugin).toHaveBeenCalledTimes(1);
    });

    test('should add web attribution tracking plugin with new campaign config', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        lastEventTime: Date.now(),
      });
      const client = new AmplitudeBrowser();
      const webAttributionPluginPlugin = jest.spyOn(webAttributionPlugin, 'webAttributionPlugin');
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        attribution: {
          trackNewCampaigns: true,
        },
        sessionId: Date.now(),
        transportProvider: {
          send: async () => ({
            status: Status.Success,
            statusCode: 200,
            body: {
              eventsIngested: 0,
              payloadSizeBytes: 0,
              serverUploadTime: 0,
            },
          }),
        },
      }).promise;
      expect(webAttributionPluginPlugin).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserId', () => {
    test('should get user id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(USER_ID);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeBrowser();
      expect(client.getUserId()).toBe(undefined);
    });
  });

  describe('setUserId', () => {
    test('should set user id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(undefined);
      client.setUserId(USER_ID);
      expect(client.getUserId()).toBe(USER_ID);
    });

    test('should not set user id', async () => {
      const client = new AmplitudeBrowser();
      const setSessionId = jest.spyOn(client, 'setSessionId');
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
      }).promise;

      // Reset mock to isolate mock for `setUserId(...)` call
      // `setUserId(...)` may have been called on `init(...)`
      // We do not want to depend on init behavior
      setSessionId.mockReset();

      expect(client.getUserId()).toBe(USER_ID);
      client.setUserId(USER_ID);
      expect(setSessionId).toHaveBeenCalledTimes(0);
      expect(client.getUserId()).toBe(USER_ID);
    });

    test('should set user and session id with start and end session event', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventTime: Date.now() - 1000,
      });
      const client = new AmplitudeBrowser();
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
      await client.init(API_KEY, USER_ID, {
        sessionTimeout: 5000,
        defaultTracking: {
          sessions: true,
        },
        ...attributionConfig,
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
        const client = new AmplitudeBrowser();
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

    test('should be able to unset user id to undefined', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(USER_ID);

      client.setUserId(undefined);
      expect(client.getUserId()).toBe(undefined);
    });

    test('should be able to unset user id to undefined after setUserId()', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      expect(client.getUserId()).toBe(undefined);

      client.setUserId(USER_ID);
      expect(client.getUserId()).toBe(USER_ID);

      client.setUserId(undefined);
      expect(client.getUserId()).toBe(undefined);
    });
  });

  describe('getDeviceId', () => {
    test('should get device id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        deviceId: DEVICE_ID,
        ...attributionConfig,
      }).promise;
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeBrowser();
      expect(client.getDeviceId()).toBe(undefined);
    });
  });

  describe('setDeviceId', () => {
    test('should set device id config', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      client.setDeviceId(DEVICE_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });

    test('should defer set device id', () => {
      return new Promise<void>((resolve) => {
        const client = new AmplitudeBrowser();
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
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
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
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        sessionId: 1,
        ...attributionConfig,
      }).promise;
      expect(client.getSessionId()).toBe(1);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeBrowser();
      expect(client.getSessionId()).toBe(undefined);
    });
  });

  describe('setSessionId', () => {
    test('should set session id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      client.setSessionId(1);
      expect(client.getSessionId()).toBe(1);
    });

    test('should set session id with start session event', async () => {
      const client = new AmplitudeBrowser();
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
      await client.init(API_KEY, undefined, {
        sessionId: 1,
        defaultTracking: {
          sessions: true,
        },
        ...attributionConfig,
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
      const client = new AmplitudeBrowser();
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
      await client.init(API_KEY, undefined, {
        sessionTimeout: 5000,
        defaultTracking: {
          sessions: true,
        },
        ...attributionConfig,
      }).promise;
      client.setSessionId(2);
      expect(client.getSessionId()).toBe(2);
      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should defer set session id', () => {
      return new Promise<void>((resolve) => {
        const client = new AmplitudeBrowser();
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

  describe('setTransport', () => {
    test('should set transport', async () => {
      const fetch = new FetchTransport();
      const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(fetch);
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      }).promise;
      client.setTransport(TransportType.Fetch);
      expect(createTransport).toHaveBeenCalledTimes(2);
    });

    test('should defer set transport', () => {
      return new Promise<void>((resolve) => {
        const fetch = new FetchTransport();
        const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(fetch);
        const client = new AmplitudeBrowser();
        void client
          .init(API_KEY, undefined, {
            ...attributionConfig,
          })
          .promise.then(() => {
            expect(createTransport).toHaveBeenCalledTimes(2);
            resolve();
          });
        client.setTransport(TransportType.Fetch);
      });
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
      const client = new AmplitudeBrowser();
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

    test('should track identify using proxy', async () => {
      const send = jest.fn().mockReturnValueOnce({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(new core.Identify());
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        transportProvider: {
          send,
        },
        ...attributionConfig,
      }).promise;
      const identifyObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.identify(identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
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
      const client = new AmplitudeBrowser();
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

    test('should track group identify using proxy', async () => {
      const send = jest.fn().mockReturnValueOnce({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(new core.Identify());
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        transportProvider: {
          send,
        },
        ...attributionConfig,
      }).promise;
      const identifyObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.groupIdentify('g', '1', identifyObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
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
      const client = new AmplitudeBrowser();
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

    test('should track revenue using proxy', async () => {
      const send = jest.fn().mockReturnValueOnce({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
      const convertProxyObjectToRealObject = jest
        .spyOn(SnippetHelper, 'convertProxyObjectToRealObject')
        .mockReturnValueOnce(new core.Revenue());
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        transportProvider: {
          send,
        },
        ...attributionConfig,
      }).promise;
      const revenueObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.revenue(revenueObject).promise;
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
    });
  });
});
