import { createInstance } from '../src/browser-client';
import * as browser from '@amplitude/analytics-browser';
import { UUID } from '@amplitude/analytics-core';
import { BrowserClient } from '@amplitude/analytics-types';

describe('browser-client', () => {
  let apiKey = '';
  let userId = '';

  beforeEach(() => {
    apiKey = UUID();
    userId = UUID();
  });

  describe('init', () => {
    test('should passthrough init call to browser SDK', async () => {
      const init = jest.fn().mockImplementation(() => ({
        promise: Promise.resolve(),
      }));
      const add = jest.fn().mockImplementation(() => ({
        promise: Promise.resolve(),
      }));

      jest.spyOn(browser, 'createInstance').mockImplementation(() => {
        const client = {} as BrowserClient;
        client.init = init;
        client.add = add;

        return client;
      });

      const client = createInstance();

      await client.init(apiKey, userId, {
        defaultTracking: {
          attribution: false,
          pageViews: {
            trackOn: 'attribution',
          },
        },
      }).promise;

      expect(add).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenNthCalledWith(1, apiKey, userId, {
        defaultTracking: {
          attribution: false,
          pageViews: {
            trackOn: 'attribution',
          },
        },
      });
    });

    test('should passthrough init call to browser SDK without config', async () => {
      const init = jest.fn().mockImplementation(() => ({
        promise: Promise.resolve(),
      }));
      const add = jest.fn().mockImplementation(() => ({
        promise: Promise.resolve(),
      }));

      jest.spyOn(browser, 'createInstance').mockImplementation(() => {
        const client = {} as BrowserClient;
        client.init = init;
        client.add = add;

        return client;
      });

      const client = createInstance();

      await client.init(apiKey, userId).promise;

      expect(add).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenNthCalledWith(1, apiKey, userId, {});
    });
  });
});
