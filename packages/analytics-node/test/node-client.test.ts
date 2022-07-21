import { AmplitudeNode } from '../src/node-client';
import * as core from '@amplitude/analytics-core';
import { Status } from '@amplitude/analytics-types';

describe('node-client', () => {
  const API_KEY = 'API_KEY';

  describe('init', () => {
    test('should return config', async () => {
      const client = new AmplitudeNode();
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
      });
      expect(client.config).toBeDefined();
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
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
      });
      const identifyObject = new core.Identify();
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
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
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
      const client = new AmplitudeNode();
      await client.init(API_KEY, {
        flushIntervalMillis: 1000,
        transportProvider: {
          send,
        },
      });
      const revenueObject = new core.Revenue();
      const result = await client.revenue(revenueObject);
      expect(result.code).toEqual(200);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
