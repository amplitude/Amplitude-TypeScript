import {
  CookieStorage,
  FetchTransport,
  getAnalyticsConnector,
  getCookieName,
  LogLevel,
  OfflineDisabled,
  Status,
  UserSession,
  AutocaptureOptions,
} from '@amplitude/analytics-core';
import { WebAttribution } from '../src/attribution/web-attribution';
import * as core from '@amplitude/analytics-core';
import * as pageViewTracking from '@amplitude/plugin-page-view-tracking-browser';
import * as autocapture from '@amplitude/plugin-autocapture-browser';
import * as networkCapturePlugin from '@amplitude/plugin-network-capture-browser';
import { AmplitudeBrowser } from '../src/browser-client';
import * as Config from '../src/config';
import * as RemoteConfig from '../src/config/joined-config';
import * as CookieMigration from '../src/cookie-migration';
import * as fileDownloadTracking from '../src/plugins/file-download-tracking';
import * as formInteractionTracking from '../src/plugins/form-interaction-tracking';
import * as networkConnectivityChecker from '../src/plugins/network-connectivity-checker';
import * as SnippetHelper from '../src/utils/snippet-helper';

jest.mock('../src/config/joined-config', () => ({
  createBrowserJoinedConfigGenerator: jest.fn().mockImplementation((localConfig) => ({
    generateJoinedConfig: jest.fn().mockResolvedValue(localConfig),
  })),
}));

describe('browser-client', () => {
  let apiKey = '';
  let userId = '';
  let deviceId = '';
  let client = new AmplitudeBrowser();
  const testDeviceId = 'test-device-id';
  const testSessionId = 12345;
  const url = new URL(`https://www.example.com?ampDeviceId=${testDeviceId}&ampSessionId=${testSessionId}`);
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
    jest.clearAllMocks();
    // clean up cookies
    document.cookie = `AMP_${apiKey}=null; expires=-1`;
  });

  describe('plugin', () => {
    test('should return plugin by name', async () => {
      const fileDownloadTrackingPlugin = jest.spyOn(fileDownloadTracking, 'fileDownloadTracking');
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking: {
          ...defaultTracking,
          fileDownloads: true,
        },
      }).promise;
      const result = client.plugin('@amplitude/plugin-file-download-tracking-browser');
      // result should be fileDownloadTrackingPlugin
      // comparing with the first call to the spy
      expect(result).toBe(fileDownloadTrackingPlugin.mock.results[0].value);
    });

    test('should return undefined when name doesn not exist', async () => {
      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };
      await client.init(apiKey, userId, {
        optOut: false,
        defaultTracking: {
          ...defaultTracking,
          fileDownloads: true,
        },
        loggerProvider: loggerProvider,
      }).promise;
      const result = client.plugin('plugin-file-download-tracking-browser');
      // result should be fileDownloadTrackingPlugin
      // comparing with the first call to the spy
      expect(result).toBe(undefined);
      expect(loggerProvider.debug).toHaveBeenCalledWith(
        'Cannot find plugin with name plugin-file-download-tracking-browser',
      );
    });
  });

  describe('init', () => {
    test('should use remote config by default', async () => {
      await client.init(apiKey).promise;
      expect(RemoteConfig.createBrowserJoinedConfigGenerator).toHaveBeenCalled();
    });

    test('should use remote config when fetchRemoteConfig is true', async () => {
      await client.init(apiKey, {
        fetchRemoteConfig: true,
      }).promise;
      expect(RemoteConfig.createBrowserJoinedConfigGenerator).toHaveBeenCalled();
    });

    test('should use remote config when fetchRemoteConfig is false', async () => {
      await client.init(apiKey, {
        fetchRemoteConfig: false,
      }).promise;
      expect(RemoteConfig.createBrowserJoinedConfigGenerator).not.toHaveBeenCalled();
    });

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

    test('should add network connectivity checker plugin by default', async () => {
      const networkConnectivityCheckerPlugin = jest.spyOn(
        networkConnectivityChecker,
        'networkConnectivityCheckerPlugin',
      );
      await client.init(apiKey, userId).promise;
      expect(networkConnectivityCheckerPlugin).toHaveBeenCalledTimes(1);
    });

    test('should not add network connectivity checker plugin if offline is disabled', async () => {
      const networkConnectivityCheckerPlugin = jest.spyOn(
        networkConnectivityChecker,
        'networkConnectivityCheckerPlugin',
      );
      await client.init(apiKey, userId, {
        offline: OfflineDisabled,
      }).promise;
      expect(networkConnectivityCheckerPlugin).toHaveBeenCalledTimes(0);
    });

    test('should add page view tracking plugin by default', async () => {
      const pageViewTrackingPlugin = jest.spyOn(pageViewTracking, 'pageViewTrackingPlugin');
      await client.init(apiKey, userId).promise;
      expect(pageViewTrackingPlugin).toHaveBeenCalledTimes(1);
    });

    test('should NOT add page view tracking plugin when DET is disabled', async () => {
      const pageViewTrackingPlugin = jest.spyOn(pageViewTracking, 'pageViewTrackingPlugin');
      await client.init(apiKey, userId, {
        defaultTracking: false,
      }).promise;
      expect(pageViewTrackingPlugin).toHaveBeenCalledTimes(0);
    });

    test('should NOT add page view tracking plugin when page view is disabled', async () => {
      const pageViewTrackingPlugin = jest.spyOn(pageViewTracking, 'pageViewTrackingPlugin');
      await client.init(apiKey, userId, {
        defaultTracking: {
          pageViews: false,
        },
      }).promise;
      expect(pageViewTrackingPlugin).toHaveBeenCalledTimes(0);
    });

    test('should NOT add default tracking plugins when autocapture is disabled', async () => {
      const pageViewTrackingPlugin = jest.spyOn(pageViewTracking, 'pageViewTrackingPlugin');
      const fileDownloadTrackingPlugin = jest.spyOn(fileDownloadTracking, 'fileDownloadTracking');
      const formInteractionTrackingPlugin = jest.spyOn(formInteractionTracking, 'formInteractionTracking');
      await client.init(apiKey, userId, {
        autocapture: {
          pageViews: false,
          fileDownloads: false,
          formInteractions: false,
        },
      }).promise;
      expect(pageViewTrackingPlugin).toHaveBeenCalledTimes(0);
      expect(fileDownloadTrackingPlugin).toHaveBeenCalledTimes(0);
      expect(formInteractionTrackingPlugin).toHaveBeenCalledTimes(0);
    });

    test.each([true, { elementInteractions: true }])(
      'should add autocapture plugin',
      async (option: boolean | AutocaptureOptions) => {
        const autocapturePlugin = jest.spyOn(autocapture, 'autocapturePlugin');
        await client.init(apiKey, userId, {
          autocapture: option,
        }).promise;
        expect(autocapturePlugin).toHaveBeenCalledTimes(1);
      },
    );

    test.each([
      undefined, // default
      false, // disabled
      { elementInteractions: false }, // disabled
    ])('should NOT add autocapture plugin', async (option: undefined | boolean | AutocaptureOptions) => {
      const autocapturePlugin = jest.spyOn(autocapture, 'autocapturePlugin');
      await client.init(apiKey, userId, {
        autocapture: option,
      }).promise;
      expect(autocapturePlugin).toHaveBeenCalledTimes(0);
    });

    test('should use network tracking plugin when autocapture.networkTracking is on', async () => {
      const networkTrackingPlugin = jest.spyOn(networkCapturePlugin, 'plugin');
      await client.init(apiKey, userId, {
        autocapture: {
          networkTracking: true,
        },
      }).promise;
      expect(networkTrackingPlugin).toHaveBeenCalledTimes(1);
    });

    test('should listen for network change to online', async () => {
      jest.useFakeTimers();
      const addEventListenerMock = jest.spyOn(window, 'addEventListener');
      const flush = jest.spyOn(client, 'flush').mockReturnValue({ promise: Promise.resolve() });
      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };

      await client.init(apiKey, {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      }).promise;
      window.dispatchEvent(new Event('online'));

      expect(addEventListenerMock).toHaveBeenCalledWith('online', expect.any(Function));
      expect(client.config.offline).toBe(false);
      expect(loggerProvider.debug).toHaveBeenCalledTimes(3);
      expect(loggerProvider.debug).toHaveBeenCalledWith('Network connectivity changed to online.');

      jest.advanceTimersByTime(client.config.flushIntervalMillis);
      expect(flush).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
      addEventListenerMock.mockRestore();
      flush.mockRestore();
    });

    test('should listen for network change to offline', async () => {
      jest.useFakeTimers();
      const addEventListenerMock = jest.spyOn(window, 'addEventListener');
      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };

      await client.init(apiKey, {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      }).promise;
      expect(client.config.offline).toBe(false);

      window.dispatchEvent(new Event('offline'));
      expect(addEventListenerMock).toHaveBeenCalledWith('offline', expect.any(Function));
      expect(client.config.offline).toBe(true);
      expect(loggerProvider.debug).toHaveBeenCalledTimes(3);
      expect(loggerProvider.debug).toHaveBeenCalledWith('Network connectivity changed to offline.');

      jest.useRealTimers();
      addEventListenerMock.mockRestore();
    });

    test('should not support offline mode if global scope returns undefined', async () => {
      const getGlobalScopeMock = jest.spyOn(core, 'getGlobalScope').mockReturnValueOnce(undefined);
      const addEventListenerMock = jest.spyOn(window, 'addEventListener');

      await client.init(apiKey, {
        defaultTracking: false,
      }).promise;

      window.dispatchEvent(new Event('online'));
      expect(client.config.offline).toBe(false);

      client.config.offline = true;
      window.dispatchEvent(new Event('offline'));
      expect(client.config.offline).toBe(true);

      getGlobalScopeMock.mockRestore();
      addEventListenerMock.mockRestore();
    });

    test.each([[url], [new URL(`https://www.example.com?deviceId=${testDeviceId}`)]])(
      'should set device id from url',
      async (mockedUrl) => {
        const originalLocation = window.location;

        Object.defineProperty(window, 'location', {
          value: {
            ...originalLocation,
            search: mockedUrl.search,
          } as Location,
          writable: true,
        });

        await client.init(apiKey, userId, {
          defaultTracking: false,
        }).promise;
        expect(client.config.deviceId).toEqual(testDeviceId);

        Object.defineProperty(window, 'location', {
          value: originalLocation,
          writable: true,
        });
      },
    );

    test('should set session id from url', async () => {
      const originalLocation = window.location;

      Object.defineProperty(window, 'location', {
        value: {
          search: url.search,
        } as Location,
        writable: true,
      });

      const setSessionId = jest.spyOn(client, 'setSessionId');

      await client.init(apiKey, userId, {
        defaultTracking: {
          attribution: false,
          fileDownloads: false,
          formInteractions: false,
          pageViews: false,
          sessions: true,
        },
      }).promise;
      expect(client.config.sessionId).toEqual(testSessionId);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenLastCalledWith(testSessionId);

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
    });

    test.each([[new URL(`https://www.example.com?ampSessionId=test}`)], [new URL(`https://www.example.com`)]])(
      'should fall back to other options when session id from url is not Number',
      async (mockedUrl) => {
        // Mock window.location
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
          value: {
            search: mockedUrl.search,
          } as Location,
          writable: true,
        });

        // Mock Date.now()
        const originalDate = Date.now;
        const currentTimestamp = Date.now();
        Date.now = jest.fn(() => currentTimestamp);

        const setSessionId = jest.spyOn(client, 'setSessionId');
        await client.init(apiKey, userId, {
          defaultTracking: {
            attribution: false,
            fileDownloads: false,
            formInteractions: false,
            pageViews: false,
            sessions: true,
          },
        }).promise;

        // Should fall back to use Date.now() because "test" from ampSessionId is NaN
        expect(client.config.sessionId).toEqual(currentTimestamp);
        expect(setSessionId).toHaveBeenCalledTimes(1);
        expect(setSessionId).toHaveBeenLastCalledWith(currentTimestamp);

        // Restore mocks
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          writable: true,
        });
        Date.now = originalDate;
      },
    );
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

    test('should not send session events on set user', async () => {
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
      expect(track).toHaveBeenCalledTimes(0);
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
      expect(track).toHaveBeenCalledTimes(3);
    });

    test('should set session id with start and end session event', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventId: 100,
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

    test('should set session id with start and end session event and web attribution event', async () => {
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventId: 100,
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
          attribution: true,
          pageViews: false,
          sessions: true,
        },
      }).promise;

      client.setSessionId(2);

      expect(client.getSessionId()).toBe(2);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(track).toHaveBeenCalledTimes(3);
          resolve();
        }, 4000);
      });
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

  describe('extendSession', () => {
    test('should extend the current session without sending events', async () => {
      const firstSessionId = 1;
      const client = new AmplitudeBrowser();
      await client.init(apiKey, {
        sessionTimeout: 20,
        sessionId: firstSessionId,
        flushQueueSize: 1,
        flushIntervalMillis: 1,
        defaultTracking,
      }).promise;
      // assert sessionId is set
      expect(client.config.sessionId).toBe(firstSessionId);
      expect(client.config.lastEventTime).toBeUndefined();

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      jest.spyOn(client.config.transportProvider, 'send').mockReturnValue(
        Promise.resolve({
          status: Status.Success,
          statusCode: 200,
          body: {
            eventsIngested: 1,
            payloadSizeBytes: 1,
            serverUploadTime: 1,
          },
        }),
      );

      // send an event
      await client.track('test 1').promise;
      const eventTime1 = client.config.lastEventTime ?? -1;
      expect(eventTime1 > 0).toBeTruthy();

      // wait for session to almost expire, then extend it
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          client.extendSession();
          resolve();
        }, 15),
      );

      // assert session id is unchanged
      expect(client.config.sessionId).toBe(firstSessionId);
      // assert last event time was updated
      const extendedLastEventTime = client.config.lastEventTime ?? -1;
      expect(extendedLastEventTime > 0).toBeTruthy();
      expect(extendedLastEventTime > eventTime1).toBeTruthy();

      // send another event just before session expires (again)
      // Mock Date.now() because isNewSession() depends on it
      const dateNowMocked = jest.spyOn(Date, 'now').mockImplementation(() => extendedLastEventTime + 15);
      await new Promise<void>((resolve) =>
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        setTimeout(async () => {
          await client.track('test 2').promise;
          resolve();
        }, 10),
      );
      dateNowMocked.mockRestore();

      // assert session id is unchanged
      expect(client.config.sessionId).toBe(firstSessionId);
      // assert last event time was updated
      const eventTime2 = client.config.lastEventTime ?? -1;
      expect(eventTime2 > 0).toBeTruthy();
      expect(eventTime2 > extendedLastEventTime).toBeTruthy();

      // Wait for session to timeout, without extendSession()
      await new Promise<void>((resolve) =>
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        setTimeout(async () => {
          await client.track('test 3').promise;
          resolve();
        }, 21),
      );
      // assert session id is changed
      expect(client.config.sessionId).not.toBe(firstSessionId);
      expect(client.config.sessionId ?? -1 > firstSessionId).toBeTruthy();
    });

    test('should extend session using proxy', async () => {
      const lastEventTime = Date.now() - 1000;
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventTime: lastEventTime,
      });

      const client = new AmplitudeBrowser();

      // call extendSession() before init()
      client.extendSession();

      // init
      await client.init(apiKey, {
        sessionTimeout: 20,
        flushQueueSize: 1,
        flushIntervalMillis: 1,
        defaultTracking,
      }).promise;

      // assert sessionId is unchanged
      expect(client.config.sessionId).toBe(1);
      // assert last event time was updated
      expect(client.config.lastEventTime).not.toBe(lastEventTime);
    });

    /**
     * Tests the reverse case of calling expire sessions
     */
    test('should expire session w/o calling extend session using proxy', async () => {
      const lastEventTime = Date.now() - 1000;
      jest.spyOn(CookieMigration, 'parseLegacyCookies').mockResolvedValueOnce({
        optOut: false,
        sessionId: 1,
        lastEventTime: lastEventTime,
      });

      const client = new AmplitudeBrowser();

      // init
      await client.init(apiKey, {
        sessionTimeout: 20,
        flushQueueSize: 1,
        flushIntervalMillis: 1,
        defaultTracking,
      }).promise;

      // assert sessionId is unchanged
      expect(client.config.sessionId).toBe(1);
      // assert last event time was updated
      expect(client.config.lastEventTime).toBe(lastEventTime);
    });
  });

  describe('pageCount', () => {
    test('init pageCounter should be 0', async () => {
      await client.init(apiKey, { defaultTracking }).promise;
      expect(client.config.pageCounter).toBe(0);
    });

    test('should set pageCounter to 0 in new session', async () => {
      await client.init(apiKey, { defaultTracking }).promise;
      client.config.pageCounter = 2;
      expect(client.config.pageCounter).toBe(2);
      client.setSessionId(Date.now() + 5 * 60 * 60);
      expect(client.config.pageCounter).toBe(0);
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

  describe('process', () => {
    test('should process create new session for new campain', async () => {
      await client.init(apiKey, {
        optOut: true,
        logLevel: LogLevel.Warn,
        defaultTracking: {
          attribution: {
            resetSessionOnNewCampaign: true,
          },
        },
      }).promise;

      expect(client.webAttribution).toBeDefined();

      // Making sure client.webAttribution is not undefined
      if (!client.webAttribution) {
        client.webAttribution = new WebAttribution({}, client.config);
      }
      jest.spyOn(client.webAttribution, 'shouldSetSessionIdOnNewCampaign').mockReturnValueOnce(true);
      const logSpy = jest.spyOn(client.config.loggerProvider, 'log');

      await client.process({
        event_type: 'event',
      });

      expect(logSpy).toHaveBeenCalledWith('Created a new session for new campaign.');
    });
    test('should track web attribution if change in campaign information', async () => {
      const track = jest.spyOn(client, 'dispatch').mockReturnValue(
        Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      );
      await client.init(apiKey, {
        optOut: true,
        logLevel: LogLevel.Warn,
        defaultTracking: {
          attribution: {
            resetSessionOnNewCampaign: true,
          },
        },
      }).promise;

      client.webAttribution = new WebAttribution({}, { ...client.config, lastEventTime: undefined });
      client.webAttribution.shouldTrackNewCampaign = true;
      jest.spyOn(core, 'isNewSession').mockReturnValueOnce(false);
      await client.process({
        event_type: 'event',
      });
      expect(track).toHaveBeenCalled();
    });

    test('should proceed with unexpired session', async () => {
      const setSessionId = jest.spyOn(client, 'setSessionId');
      await client.init(apiKey, {
        optOut: true,
        defaultTracking: false,
      }).promise;
      const result = await client.process({
        event_type: 'event',
      });
      // once on init
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(result.code).toBe(0);
    });

    test('should proceed with overriden session ID', async () => {
      const setSessionId = jest.spyOn(client, 'setSessionId');
      await client.init(apiKey, {
        optOut: true,
        defaultTracking: false,
      }).promise;
      const result = await client.process({
        event_type: 'event',
        session_id: -1,
      });
      // once on init
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(result.code).toBe(0);
    });

    test('should reset session due to expired session', async () => {
      const setSessionId = jest.spyOn(client, 'setSessionId');
      await client.init(apiKey, {
        optOut: true,
        defaultTracking: false,
        // force session to always be expired
        sessionTimeout: -1,
      }).promise;
      const result = await client.process({
        event_type: 'event',
      });
      // once on init
      // and once on process
      expect(setSessionId).toHaveBeenCalledTimes(2);
      expect(result.code).toBe(0);
    });
  });

  describe('debug logs through cookie', () => {
    test('debug logs should be persisted across page loads', async () => {
      const cookieStorage = new CookieStorage<UserSession>();
      const cookie: UserSession = {
        deviceId: '123',
        userId: '123',
        sessionId: 123,
        lastEventTime: Date.now(),
        optOut: false,
        debugLogsEnabled: true,
      };
      await cookieStorage.set(getCookieName(apiKey), cookie);

      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };

      await client.init(apiKey, {
        defaultTracking,
        logLevel: LogLevel.Error,
        loggerProvider: loggerProvider,
      }).promise;

      expect(loggerProvider.enable).toHaveBeenCalledWith(LogLevel.Debug);
      console.log(loggerProvider.enable.mock.calls);
      expect(loggerProvider.enable).toHaveBeenCalledTimes(1);
    });

    test('debug logs should not be enabled by default', async () => {
      const cookieStorage = new CookieStorage<UserSession>();
      const cookie: UserSession = {
        deviceId: '123',
        userId: '123',
        sessionId: 123,
        lastEventTime: Date.now(),
        optOut: false,
      };
      await cookieStorage.set(getCookieName(apiKey), cookie);

      const loggerProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
      };

      await client.init(apiKey, {
        defaultTracking,
        logLevel: LogLevel.Error,
        loggerProvider: loggerProvider,
      }).promise;

      expect(loggerProvider.enable).toHaveBeenCalledWith(LogLevel.Error);
    });
  });
});
