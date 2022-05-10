import { AmplitudeNode } from '../src/node-client';
import * as core from '@amplitude/analytics-core';
import { Status } from '@amplitude/analytics-types';

describe('node-client', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';
  const DEVICE_ID = 'DEVICE_ID';

  describe('init', () => {
    test('should return config', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY, USER_ID, {});
      expect(client.config).toBeDefined();
    });
  });

  describe('getUserId', () => {
    test('should get user id', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY, USER_ID);
      expect(client.getUserId()).toBe(USER_ID);
    });
  });

  describe('setUserId', () => {
    test('should set user id', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY);
      expect(client.getUserId()).toBe(undefined);
      client.setUserId(USER_ID);
      expect(client.getUserId()).toBe(USER_ID);
    });
  });

  describe('getDeviceId', () => {
    test('should get device id', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY, undefined, {
        deviceId: DEVICE_ID,
      });
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('setDeviceId', () => {
    test('should set device id config', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY);
      client.setDeviceId(DEVICE_ID);
      expect(client.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('getSessionId', () => {
    test('should get session id', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY, undefined, {
        sessionId: 1,
      });
      expect(client.getSessionId()).toBe(1);
    });
  });

  describe('setSessionId', () => {
    test('should set session id', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY);
      client.setSessionId(1);
      expect(client.getSessionId()).toBe(1);
    });
  });

  describe('setOptOut', () => {
    test('should set opt out', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY);
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
      const client = new AmplitudeNode();
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
      const client = new AmplitudeNode();
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
      const client = new AmplitudeNode();
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
      const client = new AmplitudeNode();
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
      const client = new AmplitudeNode();
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
      const client = new AmplitudeNode();
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
    });
  });
});
