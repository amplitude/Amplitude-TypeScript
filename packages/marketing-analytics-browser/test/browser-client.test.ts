import { createInstance } from '../src/browser-client';
import * as browser from '@amplitude/analytics-browser';
import { BrowserClient } from '@amplitude/analytics-types';

describe('browser-client', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';

  describe('init', () => {
    test('should add attribution plugin', async () => {
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

      await client.init(API_KEY, USER_ID).promise;

      expect(add).toHaveBeenCalledTimes(2);
      expect(init).toHaveBeenCalledTimes(1);
    });

    test('should add attribution plugin when attribution is set', async () => {
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

      await client.init(API_KEY, USER_ID, {}).promise;

      expect(add).toHaveBeenCalledTimes(2);
      expect(init).toHaveBeenCalledTimes(1);
    });

    test('should not add attribution plugin when attribution.disabled is true', async () => {
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

      await client.init(API_KEY, USER_ID, {
        attribution: {
          disabled: true,
        },
      }).promise;

      expect(add).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
    });

    test('should transform config for page view tracking', async () => {
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

      await client.init(API_KEY, USER_ID, {
        attribution: {
          disabled: true,
        },
        pageViewTracking: {
          trackOn: 'attribution',
        },
      }).promise;

      expect(add).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenNthCalledWith(1, API_KEY, USER_ID, {
        attribution: {
          disabled: true,
        },
        defaultTracking: {
          pageViews: {
            trackOn: 'attribution',
            trackHistoryChanges: undefined,
            eventType: 'Page View',
          },
        },
      });
    });
  });
});
