import { AmplitudeBrowser } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as SessionManager from '../src/session-manager';
import * as CookieMigration from '../src/cookie-migration';
import * as attribution from '../src/attribution';
import { Status, TransportType } from '@amplitude/analytics-types';
import { FetchTransport } from '../src/transports/fetch';
import * as SnippetHelper from '../src/utils/snippet-helper';

describe('browser-client', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';
  const DEVICE_ID = 'DEVICE_ID';

  afterEach(() => {
    // clean up cookies
    document.cookie = 'AMP_API_KEY=null; expires=-1';
  });

  describe('init', () => {
    test('should return config', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        optOut: false,
      });
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      const getAttributions = jest.spyOn(attribution, 'getAttributions').mockReturnValueOnce({
        utm_source: 'utm_source',
      });
      const client = new AmplitudeBrowser();
      jest.spyOn(client, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'event_type',
          },
          code: 200,
          message: 'message',
        }),
      );
      await client.init(API_KEY, USER_ID, {});
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(getAttributions).toHaveBeenCalledTimes(1);
    });

    test('should read from cookies config', async () => {
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        optOut: false,
        deviceId: DEVICE_ID,
        sessionId: 1,
      });
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      const getAttributions = jest.spyOn(attribution, 'getAttributions').mockReturnValueOnce({});
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID, {
        optOut: true,
      });
      expect(client.getDeviceId()).toBe(DEVICE_ID);
      expect(client.getSessionId()).toBe(1);
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(getAttributions).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserId', () => {
    test('should get user id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, USER_ID);
      expect(client.getUserId()).toBe(USER_ID);
    });
  });

  describe('setUserId', () => {
    test('should set user id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY);
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
      });
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('setDeviceId', () => {
    test('should set device id config', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY);
      client.setDeviceId(DEVICE_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('getSessionId', () => {
    test('should get session id', async () => {
      const client = new AmplitudeBrowser();
      await client.init(API_KEY, undefined, {
        sessionId: 1,
      });
      expect(client.getSessionId()).toBe(1);
    });
  });

  describe('setSessionId', () => {
    test('should set session id', async () => {
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      const client = new AmplitudeBrowser();
      await client.init(API_KEY);
      client.setSessionId(1);
      expect(client.getSessionId()).toBe(1);
      expect(updateCookies).toHaveBeenCalledTimes(2);
    });
  });

  describe('setOptOut', () => {
    test('should set opt out', async () => {
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      const client = new AmplitudeBrowser();
      await client.init(API_KEY);
      client.setOptOut(true);
      expect(updateCookies).toHaveBeenCalledTimes(2);
    });
  });

  describe('setTransport', () => {
    test('should set transport', async () => {
      const fetch = new FetchTransport();
      const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(fetch);
      const client = new AmplitudeBrowser();
      await client.init(API_KEY);
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
      });
      const identifyObject = new core.Identify();
      const result = await client.identify(identifyObject);
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
