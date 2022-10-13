import * as amplitude from '@amplitude/analytics-browser';
import { default as nock } from 'nock';
import { success } from './responses';
import 'isomorphic-fetch';
import { path, SUCCESS_MESSAGE, url, uuidPattern } from './constants';
import { PluginType, Response, Transport } from '@amplitude/analytics-types';
import { BaseTransport } from '@amplitude/analytics-core';

const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};

class DummyTransport extends BaseTransport implements Transport {
  async send(): Promise<Response | null> {
    return this.buildResponse({
      code: 200,
    });
  }
}

describe('integration', () => {
  const uuid: string = expect.stringMatching(uuidPattern) as string;
  const library = expect.stringMatching(/^amplitude-ts\/.+/) as string;
  const number = expect.any(Number) as number;
  const opts = {
    trackingOptions: { deviceModel: false },
    attribution: {
      disabled: true,
    },
  };

  afterEach(() => {
    // clean up cookies
    document.cookie = 'AMP_API_KEY=null; expires=-1';
  });

  // WARNING: This test has to run first
  // This test is under the assumption that amplitude has not be initiated at all
  // To achieve this condition, it must run before any other tests
  describe('FIRST TEST: defer initialization', () => {
    beforeAll(() => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: '',
          href: '',
          pathname: '',
          search: '',
        },
        writable: true,
      });
    });

    beforeEach(() => {
      (window.location as any) = {
        hostname: '',
        href: '',
        pathname: '',
        search: '',
      };
    });

    test('should allow init to be called after other APIs', () => {
      return new Promise((resolve) => {
        const scope = nock(url).post(path).reply(200, success);

        // NOTE: Values to assert on
        const sessionId = Date.now() - 1000;
        const userId = 'user@amplitude.com';
        const deviceId = 'device-12345';
        const platform = 'Jest';

        amplitude.setUserId(userId);
        amplitude.setDeviceId(deviceId);
        amplitude.setSessionId(sessionId);
        amplitude.add({
          type: PluginType.ENRICHMENT,
          name: 'custom',
          setup: async () => {
            return undefined;
          },
          execute: async (event) => {
            event.platform = platform;
            return event;
          },
        });
        void amplitude.track('Event Before Init').promise.then((response) => {
          expect(response.event).toEqual({
            device_id: deviceId, // NOTE: Device ID was set before init
            device_manufacturer: undefined,
            event_id: 0,
            event_type: 'Event Before Init',
            insert_id: uuid,
            ip: '$remote',
            language: 'en-US',
            library: library,
            os_name: 'WebKit',
            os_version: '537.36',
            partner_id: undefined,
            plan: undefined,
            ingestion_metadata: undefined,
            platform: platform, // NOTE: Session ID was set using a plugin added before init
            session_id: sessionId, // NOTE: Session ID was set before init
            time: number,
            user_id: userId, // NOTE: User ID was set before init
          });
          expect(response.code).toBe(200);
          expect(response.message).toBe(SUCCESS_MESSAGE);
          scope.done();
          resolve(undefined);
        });
        amplitude.init('API_KEY', undefined, {
          ...opts,
          serverUrl: url + path,
        });
      });
    });

    test('should set attribution on init prior to running queued methods', async () => {
      const search = 'utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_term=keyword&utm_content=adcopy';
      const hostname = 'www.example.com';
      const pathname = '/path/to/page';
      const windowUrl = new URL(`https://${hostname}${pathname}?${search}`);
      mockWindowLocationFromURL(windowUrl);

      // NOTE: Values to assert on
      const sessionId = Date.now() - 1000;
      const userId = 'user@amplitude.com';
      const deviceId = 'device-12345';

      const transportProvider = new DummyTransport();
      const send = jest.spyOn(transportProvider, 'send');
      const track = jest.fn();

      amplitude.setUserId(userId);
      amplitude.setDeviceId(deviceId);
      amplitude.setSessionId(sessionId);

      void amplitude.track('Event Before Init').promise.then((result) => {
        track(result.event.event_type);
      });
      await amplitude.init('API_KEY', undefined, {
        ...opts,
        transportProvider,
        attribution: {
          disabled: false,
        },
      }).promise;

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        'https://api2.amplitude.com/2/httpapi',
        expect.objectContaining({
          api_key: 'API_KEY',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          events: expect.arrayContaining([
            expect.objectContaining({
              event_type: '$identify',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              user_properties: expect.objectContaining({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                $setOnce: expect.objectContaining({
                  initial_utm_source: 'google',
                  initial_utm_medium: 'cpc',
                  initial_utm_campaign: 'brand',
                  initial_utm_term: 'keyword',
                  initial_utm_content: 'adcopy',
                }),
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                $set: expect.objectContaining({
                  utm_source: 'google',
                  utm_medium: 'cpc',
                  utm_campaign: 'brand',
                  utm_term: 'keyword',
                  utm_content: 'adcopy',
                }),
              }),
            }),
          ]),
        }),
      );

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith('Event Before Init');
      expect(send.mock.invocationCallOrder[0]).toBe(1);
      expect(track.mock.invocationCallOrder[0]).toBe(2);
    });
  });

  describe('track', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        ...opts,
      }).promise;
      const response = await amplitude.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        event_properties: {
          mode: 'test',
        },
        library: library,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with custom config', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', 'sdk.dev@amplitude.com', {
        deviceId: 'deviceId',
        sessionId: 1,
        ...opts,
      }).promise;
      const response = await amplitude.track('test event').promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        library: library,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with event options', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        ...opts,
      }).promise;
      const response = await amplitude.track('test event', undefined, {
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
      }).promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        library: library,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with optional ingestionMetadata option', async () => {
      const scope = nock(url).post(path).reply(200, success);

      const sourceName = 'ampli';
      const sourceVersion = '2.0.0';
      await amplitude.init('API_KEY', undefined, {
        ...opts,
        ingestionMetadata: {
          sourceName,
          sourceVersion,
        },
      }).promise;
      const response = await amplitude.track('test event', undefined, {
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
      }).promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        library: library,
        ingestion_metadata: {
          source_name: sourceName,
          source_version: sourceVersion,
        },
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with base event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        ...opts,
      }).promise;
      const response = await amplitude.track(
        {
          event_type: 'test event',
          groups: {
            org: '15',
          },
        },
        undefined,
        {
          user_id: 'sdk.dev@amplitude.com',
          device_id: 'deviceId',
          session_id: 1,
        },
      ).promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        library: library,
        groups: {
          org: '15',
        },
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should handle 400 error', async () => {
      const first = nock(url)
        .post(path)
        .reply(400, {
          code: 400,
          error: 'Invalid field values on some events',
          events_with_invalid_fields: {
            device_id: [1],
          },
        });
      const second = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2', undefined, {
          device_id: undefined,
        }).promise,
      ]);
      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: undefined,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 1,
        library: library,
      });
      expect(response[1].code).toBe(400);
      expect(response[1].message).toBe('Invalid field values on some events');
      first.done();
      second.done();
    });

    test('should handle 413 error', async () => {
      const first = nock(url).post(path).reply(413, {
        code: 413,
        error: 'Payload too large',
      });
      const second = nock(url).post(path).times(2).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        logLevel: 0,
        flushQueueSize: 2,
        ...opts,
      }).promise;
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2').promise,
      ]);
      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 1,
        library: library,
      });
      expect(response[1].code).toBe(200);
      expect(response[1].message).toBe(SUCCESS_MESSAGE);
      first.done();
      second.done();
    });

    test('should handle 429 error', async () => {
      const first = nock(url)
        .post(path)
        .reply(429, {
          code: 429,
          error: 'Too many requests for some devices and users',
          exceeded_daily_quota_devices: {
            throttled_device_id: 1,
          },
        });
      const second = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2', undefined, {
          device_id: 'throttled_device_id',
        }).promise,
      ]);
      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: 'throttled_device_id',
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 1,
        library: library,
      });
      expect(response[1].code).toBe(429);
      expect(response[1].message).toBe('Too many requests for some devices and users');
      first.done();
      second.done();
    });

    test('should handle 500 error', async () => {
      const first = nock(url).post(path).reply(500, {
        code: 500,
      });
      const second = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2').promise,
      ]);
      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 1,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      first.done();
      second.done();
    });

    test('should exhaust max retries', async () => {
      const scope = nock(url).post(path).times(3).reply(500, {
        code: 500,
      });

      await amplitude.init('API_KEY', undefined, {
        logLevel: 0,
        flushMaxRetries: 3,
        ...opts,
      }).promise;
      const response = await amplitude.track('test event').promise;
      expect(response.event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        library: library,
      });
      expect(response.code).toBe(500);
      expect(response.message).toBe('Event rejected due to exceeded retry count');
      scope.done();
    }, 10000);

    test('should handle missing api key', async () => {
      await amplitude.init('', undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await amplitude.track('test event').promise;
      expect(response.code).toBe(400);
      expect(response.message).toBe('Event rejected due to missing API key');
    });

    test('should handle client opt out', async () => {
      await amplitude.init('API_KEY', undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      amplitude.setOptOut(true);
      const response = await amplitude.track('test event').promise;
      expect(response.code).toBe(0);
      expect(response.message).toBe('Event skipped due to optOut config');
    });
  });

  describe('identify', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        ...opts,
      }).promise;
      const id = new amplitude.Identify();
      id.set('org', 'amp');
      id.setOnce('initial_org', 'amp');
      id.append('locations_1', 'ca');
      id.prepend('locations_2', 'ny');
      id.postInsert('tasks_1', 'a');
      id.preInsert('tasks_2', 'b');
      id.remove('company', 'x');
      id.add('employees', 1);
      const response = await amplitude.identify(id).promise;
      expect(response.event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: '$identify',
        event_id: 0,
        library: library,
        user_properties: {
          $add: {
            employees: 1,
          },
          $append: {
            locations_1: 'ca',
          },
          $postInsert: {
            tasks_1: 'a',
          },
          $preInsert: {
            tasks_2: 'b',
          },
          $prepend: {
            locations_2: 'ny',
          },
          $remove: {
            company: 'x',
          },
          $set: {
            org: 'amp',
          },
          $setOnce: {
            initial_org: 'amp',
          },
        },
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });
  });

  describe('revenue', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        ...opts,
      }).promise;
      const rev = new amplitude.Revenue();
      rev.setProductId('1');
      rev.setQuantity(1);
      rev.setPrice(100);
      rev.setRevenueType('t');
      rev.setRevenue(200);
      const response = await amplitude.revenue(rev).promise;
      expect(response.event).toEqual({
        device_id: uuid,
        device_manufacturer: undefined,
        event_id: 0,
        event_properties: {
          $price: 100,
          $productId: '1',
          $quantity: 1,
          $revenue: 200,
          $revenueType: 't',
        },
        event_type: 'revenue_amount',
        insert_id: uuid,
        ip: '$remote',
        language: 'en-US',
        library: library,
        os_name: 'WebKit',
        os_version: '537.36',
        partner_id: undefined,
        platform: 'Web',
        session_id: number,
        time: number,
        user_id: undefined,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });
  });

  describe('setGroup', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await amplitude.init('API_KEY', undefined, {
        ...opts,
      }).promise;
      const response = await amplitude.setGroup('org', 'engineering').promise;
      expect(response.event).toEqual({
        device_id: uuid,
        device_manufacturer: undefined,
        event_id: 0,
        event_type: '$identify',
        groups: {
          org: 'engineering',
        },
        insert_id: uuid,
        ip: '$remote',
        language: 'en-US',
        library: library,
        os_name: 'WebKit',
        os_version: '537.36',
        partner_id: undefined,
        platform: 'Web',
        session_id: number,
        time: number,
        user_id: undefined,
        user_properties: {
          $set: {
            org: 'engineering',
          },
        },
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });
  });

  describe('cookie migration', () => {
    test('should use old cookies', async () => {
      const scope = nock(url).post(path).reply(200, success);
      const API_KEY = 'asdfasdf';
      const timestamp = Date.now();
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      document.cookie = `amp_${API_KEY.substring(0, 6)}=deviceId.${encodedUserId}..${time}.${time}`;
      await amplitude.init(API_KEY, undefined, {
        ...opts,
      }).promise;
      const response = await amplitude.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event).toEqual({
        user_id: userId,
        device_id: 'deviceId',
        session_id: timestamp,
        time: number,
        platform: 'Web',
        os_name: 'WebKit',
        os_version: '537.36',
        device_manufacturer: undefined,
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 0,
        event_properties: {
          mode: 'test',
        },
        library: library,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });
  });

  describe('custom config', () => {
    describe('serverUrl', () => {
      test('should track event to custom serverUrl', async () => {
        const serverUrl = 'https://domain.com';
        const scope = nock(serverUrl).post(path).reply(200, success);

        await amplitude.init('API_KEY', undefined, {
          ...opts,
          serverUrl: serverUrl + path,
        }).promise;
        const response = await amplitude.track('test event').promise;
        expect(response.event).toEqual({
          user_id: undefined,
          device_id: uuid,
          session_id: number,
          time: number,
          platform: 'Web',
          os_name: 'WebKit',
          os_version: '537.36',
          device_manufacturer: undefined,
          language: 'en-US',
          ip: '$remote',
          insert_id: uuid,
          partner_id: undefined,
          event_type: 'test event',
          event_id: 0,
          library: library,
        });
        expect(response.code).toBe(200);
        expect(response.message).toBe(SUCCESS_MESSAGE);
        scope.done();
      });
    });
  });
});
