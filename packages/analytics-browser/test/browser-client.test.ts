import { AmplitudeBrowser } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as CookieMigration from '../src/cookie-migration';
import { Status, TransportType, UserSession } from '@amplitude/analytics-types';
import { FetchTransport } from '../src/transports/fetch';
import * as SnippetHelper from '../src/utils/snippet-helper';

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
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({
        optOut: false,
      });
      const client = new AmplitudeBrowser();
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
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        optOut: false,
        cookieStorage,
        ...attributionConfig,
      });
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).toBe(1);
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
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
      const client = new AmplitudeBrowser();
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
      const client = new AmplitudeBrowser();
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
      const client = new AmplitudeBrowser();
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
  });

  describe('trackCampaign', () => {
    test('should track campaign', async () => {
      const client = new AmplitudeBrowser();
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

  describe('getUserId', () => {
    test('should get user id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        ...attributionConfig,
      });
      expect(client.getUserId()).toBe(USER_ID);
    });
  });

  describe('setUserId', () => {
    test('should set user id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      });
      expect(client.getUserId()).toBe(undefined);
      client.setUserId(USER_ID);
      expect(client.getUserId()).toBe(USER_ID);
    });
  });

  describe('getDeviceId', () => {
    test('should get device id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        deviceId: DEVICE_ID,
        ...attributionConfig,
      });
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('setDeviceId', () => {
    test('should set device id config', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      });
      client.setDeviceId(DEVICE_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('regenerateDeviceId', () => {
    test('should generate new device id config', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY);
      client.setDeviceId(DEVICE_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      client.regenerateDeviceId();
      expect(client.getDeviceId()).not.toBe(DEVICE_ID);
    });
  });

  describe('getSessionId', () => {
    test('should get session id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        sessionId: 1,
        ...attributionConfig,
      });
      expect(client.getSessionId()).toBe(1);
    });
  });

  describe('setSessionId', () => {
    test('should set session id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      });
      client.setSessionId(1);
      expect(client.getSessionId()).toBe(1);
    });
  });

  describe('setOptOut', () => {
    test('should set opt out', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      });
      client.setOptOut(true);
      expect(client.config.optOut).toBe(true);
    });
  });

  describe('setTransport', () => {
    test('should set transport', async () => {
      const fetch = new FetchTransport();
      const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(fetch);
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        ...attributionConfig,
      });
      client.setTransport(TransportType.Fetch);
      expect(createTransport).toHaveBeenCalledTimes(2);
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
      });
      const identifyObject = new core.Identify();
      const result = await client.identify(identifyObject, { user_id: '123' });
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
      });
      const identifyObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.identify(identifyObject);
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
      });
      const identifyObject = new core.Identify();
      const result = await client.groupIdentify('g', '1', identifyObject);
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
      });
      const identifyObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.groupIdentify('g', '1', identifyObject);
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
      });
      const revenueObject = new core.Revenue();
      const result = await client.revenue(revenueObject);
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
      });
      const revenueObject = {
        _q: [],
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to verify behavior in snippet installation
      const result = await client.revenue(revenueObject);
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
      expect(convertProxyObjectToRealObject).toHaveBeenCalledTimes(1);
    });
  });
});
