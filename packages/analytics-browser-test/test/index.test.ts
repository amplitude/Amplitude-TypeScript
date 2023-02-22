/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { default as nock } from 'nock';
import { success } from './responses';
import 'isomorphic-fetch';
import { path, SUCCESS_MESSAGE, url, uuidPattern } from './constants';
import { PluginType, LogLevel, BaseEvent, Status } from '@amplitude/analytics-types';
import { UUID } from '@amplitude/analytics-core';

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

  let apiKey = '';
  let client = amplitude.createInstance();

  beforeEach(() => {
    client = amplitude.createInstance();
    apiKey = UUID();
  });

  afterEach(() => {
    // clean up cookies
    document.cookie = `AMP_${apiKey.substring(0, 6)}=null; expires=-1`;
    document.cookie = `AMP_${apiKey.substring(0, 10)}=null; expires=-1`;
  });

  describe('defer initialization', () => {
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

        client.setUserId(userId);
        client.setDeviceId(deviceId);
        client.setSessionId(sessionId);
        client.add({
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
        void client.track('Event Before Init').promise.then((response) => {
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
        client.init(apiKey, undefined, {
          ...opts,
          serverUrl: url + path,
        });
      });
    });

    test('should set attribution on init prior to running queued methods', async () => {
      let requestBody1: Record<string, any> = {};
      const scope1 = nock(url)
        .post(path, (body: Record<string, any>) => {
          requestBody1 = body;
          return true;
        })
        .reply(200, success);

      // NOTE: Values to assert on
      const sessionId = Date.now() - 1000;
      const userId = 'user@amplitude.com';
      const deviceId = 'device-12345';

      client.setUserId(userId);
      client.setDeviceId(deviceId);
      client.setSessionId(sessionId);

      const trackPromise = client.track('Event Before Init').promise;
      await client.init(apiKey, undefined, {
        ...opts,
        attribution: {
          disabled: false,
          trackPageViews: true,
        },
      }).promise;
      await trackPromise;

      expect(requestBody1).toEqual({
        api_key: apiKey,
        events: [
          {
            device_id: deviceId,
            session_id: sessionId,
            user_id: userId,
            time: number,
            platform: 'Web',
            os_name: 'WebKit',
            os_version: '537.36',
            language: 'en-US',
            ip: '$remote',
            insert_id: uuid,
            event_type: 'Page View',
            event_properties: {
              page_domain: '',
              page_location: '',
              page_path: '',
              page_title: '',
              page_url: '',
            },
            user_properties: {
              $setOnce: {
                initial_dclid: 'EMPTY',
                initial_fbclid: 'EMPTY',
                initial_gbraid: 'EMPTY',
                initial_gclid: 'EMPTY',
                initial_ko_click_id: 'EMPTY',
                initial_msclkid: 'EMPTY',
                initial_referrer: 'EMPTY',
                initial_referring_domain: 'EMPTY',
                initial_ttclid: 'EMPTY',
                initial_twclid: 'EMPTY',
                initial_utm_campaign: 'EMPTY',
                initial_utm_content: 'EMPTY',
                initial_utm_medium: 'EMPTY',
                initial_utm_source: 'EMPTY',
                initial_utm_term: 'EMPTY',
                initial_utm_id: 'EMPTY',
                initial_wbraid: 'EMPTY',
              },
              $unset: {
                dclid: '-',
                fbclid: '-',
                gbraid: '-',
                gclid: '-',
                ko_click_id: '-',
                msclkid: '-',
                referrer: '-',
                referring_domain: '-',
                ttclid: '-',
                twclid: '-',
                utm_campaign: '-',
                utm_content: '-',
                utm_id: '-',
                utm_medium: '-',
                utm_source: '-',
                utm_term: '-',
                wbraid: '-',
              },
            },
            event_id: 0,
            library: library,
          },
          {
            device_id: deviceId,
            session_id: sessionId,
            user_id: userId,
            time: number,
            platform: 'Web',
            os_name: 'WebKit',
            os_version: '537.36',
            language: 'en-US',
            ip: '$remote',
            insert_id: uuid,
            event_type: 'Event Before Init',
            event_id: 1,
            library: library,
          },
        ],
        options: {},
      });
      scope1.done();
    });
  });

  describe('track', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await client.init(apiKey, undefined, {
        ...opts,
      }).promise;
      const response = await client.track('test event', {
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

      await client.init(apiKey, 'sdk.dev@amplitude.com', {
        deviceId: 'deviceId',
        sessionId: 1,
        ...opts,
      }).promise;
      const response = await client.track('test event').promise;
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

      await client.init(apiKey, undefined, {
        ...opts,
      }).promise;
      const response = await client.track('test event', undefined, {
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
      await client.init(apiKey, undefined, {
        ...opts,
        ingestionMetadata: {
          sourceName,
          sourceVersion,
        },
      }).promise;
      const response = await client.track('test event', undefined, {
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

      await client.init(apiKey, undefined, {
        ...opts,
      }).promise;
      const response = await client.track(
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

      await client.init(apiKey, undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await Promise.all([
        client.track('test event 1').promise,
        client.track('test event 2', undefined, {
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

      await client.init(apiKey, undefined, {
        logLevel: 0,
        flushQueueSize: 2,
        ...opts,
      }).promise;
      const response = await Promise.all([client.track('test event 1').promise, client.track('test event 2').promise]);
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

      await client.init(apiKey, undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await Promise.all([
        client.track('test event 1').promise,
        client.track('test event 2', undefined, {
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

      await client.init(apiKey, undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await Promise.all([client.track('test event 1').promise, client.track('test event 2').promise]);
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

      await client.init(apiKey, undefined, {
        logLevel: 0,
        flushMaxRetries: 3,
        ...opts,
      }).promise;
      const response = await client.track('test event').promise;
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
      await client.init('', undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      const response = await client.track('test event').promise;
      expect(response.code).toBe(400);
      expect(response.message).toBe('Event rejected due to missing API key');
    });

    test('should handle client opt out', async () => {
      await client.init(apiKey, undefined, {
        logLevel: 0,
        ...opts,
      }).promise;
      client.setOptOut(true);
      const response = await client.track('test event').promise;
      expect(response.code).toBe(0);
      expect(response.message).toBe('Event skipped due to optOut config');
    });
  });

  describe('identify', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await client.init(apiKey, undefined, {
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
      const response = await client.identify(id).promise;
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

      await client.init(apiKey, undefined, {
        ...opts,
      }).promise;
      const rev = new amplitude.Revenue();
      rev.setProductId('1');
      rev.setQuantity(1);
      rev.setPrice(100);
      rev.setRevenueType('t');
      rev.setRevenue(200);
      const response = await client.revenue(rev).promise;
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

      await client.init(apiKey, undefined, {
        ...opts,
      }).promise;
      const response = await client.setGroup('org', 'engineering').promise;
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

  describe('session handler', () => {
    test('should send session events and replaced with known user', () => {
      let payload: any = undefined;
      const send = jest.fn().mockImplementationOnce(async (_endpoint, p) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        payload = p;
        return {
          status: Status.Success,
          statusCode: 200,
          body: {
            eventsIngested: 1,
            payloadSizeBytes: 1,
            serverUploadTime: 1,
          },
        };
      });
      client.init(apiKey, 'user1@amplitude.com', {
        defaultTracking: {
          sessions: true,
        },
        transportProvider: {
          send,
        },
        sessionTimeout: 500,
        flushIntervalMillis: 3000,
        trackingOptions: {
          deviceModel: false,
        },
      });
      // Sends `session_start` event
      client.track('Event in first session');

      setTimeout(() => {
        client.track('Event in next session');
        // Sends `session_end` event for previous session
        // Sends `session_start` event for next session
      }, 1000);

      setTimeout(() => {
        client.setUserId('user2@amplitude.com'); // effectively creates a new session
        // Sends `session_end` event for previous user and session
        // Sends `session_start` event for next user and session
      }, 2000);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Tranform events to be grouped by session and ordered by time
          // Helps assert that events will show up correctly on Amplitude UI
          const compactEvents: { eventType: string; userId: string; sessionId: number; time: number }[] =
            payload.events.map((e: BaseEvent) => ({
              eventType: e.event_type,
              userId: e.user_id,
              sessionId: e.session_id,
              time: e.time,
            }));
          const compactEventsBySessionAndTime = Object.values(
            compactEvents.reduce<
              Record<string, { eventType: string; userId: string; sessionId: number; time: number }[]>
            >((acc, curr) => {
              if (!acc[curr.sessionId]) {
                acc[curr.sessionId] = [];
              }
              acc[curr.sessionId].push(curr);
              return acc;
            }, {}),
          )
            .map((c) => c.sort((a, b) => a.time - b.time))
            .map((group) => group.map((c) => ({ eventType: c.eventType, userId: c.userId })));

          // The order of events in the payload is sorted by time of track fn invokation
          // and not consistent with the time property
          // Session events have overwritten time property
          // Assert that events grouped by session and ordered by time
          expect(compactEventsBySessionAndTime).toEqual([
            [
              {
                eventType: 'session_start',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: '$identify',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'Event in first session',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'session_end',
                userId: 'user1@amplitude.com',
              },
            ],
            [
              {
                eventType: 'session_start',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'Event in next session',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'session_end',
                userId: 'user1@amplitude.com',
              },
            ],
            [
              {
                eventType: 'session_start',
                userId: 'user2@amplitude.com',
              },
            ],
          ]);
          expect(payload).toEqual({
            api_key: apiKey,
            events: [
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 0,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 1,
                event_type: '$identify',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
                user_properties: {
                  $setOnce: {
                    initial_dclid: 'EMPTY',
                    initial_fbclid: 'EMPTY',
                    initial_gbraid: 'EMPTY',
                    initial_gclid: 'EMPTY',
                    initial_ko_click_id: 'EMPTY',
                    initial_msclkid: 'EMPTY',
                    initial_referrer: 'EMPTY',
                    initial_referring_domain: 'EMPTY',
                    initial_ttclid: 'EMPTY',
                    initial_twclid: 'EMPTY',
                    initial_utm_campaign: 'EMPTY',
                    initial_utm_content: 'EMPTY',
                    initial_utm_id: 'EMPTY',
                    initial_utm_medium: 'EMPTY',
                    initial_utm_source: 'EMPTY',
                    initial_utm_term: 'EMPTY',
                    initial_wbraid: 'EMPTY',
                  },
                  $unset: {
                    dclid: '-',
                    fbclid: '-',
                    gbraid: '-',
                    gclid: '-',
                    ko_click_id: '-',
                    msclkid: '-',
                    referrer: '-',
                    referring_domain: '-',
                    ttclid: '-',
                    twclid: '-',
                    utm_campaign: '-',
                    utm_content: '-',
                    utm_id: '-',
                    utm_medium: '-',
                    utm_source: '-',
                    utm_term: '-',
                    wbraid: '-',
                  },
                },
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 2,
                event_type: 'Event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 3,
                event_type: 'Event in next session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 4,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 5,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 6,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library: 'amplitude-ts/1.8.0',
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 7,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library: 'amplitude-ts/1.8.0',
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user2@amplitude.com',
              },
            ],
            options: {
              min_id_length: undefined,
            },
          });
          resolve();
        }, 4000);
      });
    });

    test('should send session events and replaced with unknown user', () => {
      let payload: any = undefined;
      const send = jest.fn().mockImplementationOnce(async (_endpoint, p) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        payload = p;
        return {
          status: Status.Success,
          statusCode: 200,
          body: {
            eventsIngested: 1,
            payloadSizeBytes: 1,
            serverUploadTime: 1,
          },
        };
      });
      client.init(apiKey, 'user1@amplitude.com', {
        defaultTracking: {
          sessions: true,
        },
        transportProvider: {
          send,
        },
        sessionTimeout: 500,
        flushIntervalMillis: 3000,
        trackingOptions: {
          deviceModel: false,
        },
      });
      // Sends `session_start` event
      client.track('Event in first session');

      setTimeout(() => {
        client.track('Event in next session');
        // Sends `session_end` event for previous session
        // Sends `session_start` event for next session
      }, 1000);

      setTimeout(() => {
        client.reset(); // effectively creates a new session
        // Sends `session_end` event for previous user and session
        // Sends `session_start` event for next user and session
      }, 2000);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Tranform events to be grouped by session and ordered by time
          // Helps assert that events will show up correctly on Amplitude UI
          const compactEvents: { eventType: string; userId: string; sessionId: number; time: number }[] =
            payload.events.map((e: BaseEvent) => ({
              eventType: e.event_type,
              userId: e.user_id,
              sessionId: e.session_id,
              time: e.time,
            }));
          const compactEventsBySessionAndTime = Object.values(
            compactEvents.reduce<
              Record<string, { eventType: string; userId: string; sessionId: number; time: number }[]>
            >((acc, curr) => {
              if (!acc[curr.sessionId]) {
                acc[curr.sessionId] = [];
              }
              acc[curr.sessionId].push(curr);
              return acc;
            }, {}),
          )
            .map((c) => c.sort((a, b) => a.time - b.time))
            .map((group) => group.map((c) => ({ eventType: c.eventType, userId: c.userId })));

          // The order of events in the payload is sorted by time of track fn invokation
          // and not consistent with the time property
          // Session events have overwritten time property
          // Assert that events grouped by session and ordered by time
          expect(compactEventsBySessionAndTime).toEqual([
            [
              {
                eventType: 'session_start',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: '$identify',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'Event in first session',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'session_end',
                userId: 'user1@amplitude.com',
              },
            ],
            [
              {
                eventType: 'session_start',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'Event in next session',
                userId: 'user1@amplitude.com',
              },
              {
                eventType: 'session_end',
                userId: 'user1@amplitude.com',
              },
            ],
            [
              {
                eventType: 'session_start',
                userId: undefined,
              },
            ],
          ]);
          expect(payload).toEqual({
            api_key: apiKey,
            events: [
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 0,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 1,
                event_type: '$identify',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
                user_properties: {
                  $setOnce: {
                    initial_dclid: 'EMPTY',
                    initial_fbclid: 'EMPTY',
                    initial_gbraid: 'EMPTY',
                    initial_gclid: 'EMPTY',
                    initial_ko_click_id: 'EMPTY',
                    initial_msclkid: 'EMPTY',
                    initial_referrer: 'EMPTY',
                    initial_referring_domain: 'EMPTY',
                    initial_ttclid: 'EMPTY',
                    initial_twclid: 'EMPTY',
                    initial_utm_campaign: 'EMPTY',
                    initial_utm_content: 'EMPTY',
                    initial_utm_id: 'EMPTY',
                    initial_utm_medium: 'EMPTY',
                    initial_utm_source: 'EMPTY',
                    initial_utm_term: 'EMPTY',
                    initial_wbraid: 'EMPTY',
                  },
                  $unset: {
                    dclid: '-',
                    fbclid: '-',
                    gbraid: '-',
                    gclid: '-',
                    ko_click_id: '-',
                    msclkid: '-',
                    referrer: '-',
                    referring_domain: '-',
                    ttclid: '-',
                    twclid: '-',
                    utm_campaign: '-',
                    utm_content: '-',
                    utm_id: '-',
                    utm_medium: '-',
                    utm_source: '-',
                    utm_term: '-',
                    wbraid: '-',
                  },
                },
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 2,
                event_type: 'Event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 3,
                event_type: 'Event in next session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 4,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 5,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 6,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library: 'amplitude-ts/1.8.0',
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                device_manufacturer: undefined,
                event_id: 7,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library: 'amplitude-ts/1.8.0',
                os_name: 'WebKit',
                os_version: '537.36',
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_id: undefined,
              },
            ],
            options: {
              min_id_length: undefined,
            },
          });
          resolve();
        }, 4000);
      });
    });
  });

  describe('cookie migration', () => {
    test('should use old cookies', async () => {
      const scope = nock(url).post(path).reply(200, success);
      const timestamp = Date.now();
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      document.cookie = `amp_${apiKey.substring(0, 6)}=deviceId.${encodedUserId}..${time}.${time}`;
      await client.init(apiKey, undefined, {
        ...opts,
      }).promise;
      const response = await client.track('test event', {
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
      expect(document.cookie.includes('amp_')).toBe(false);
      scope.done();
    });

    test('should retain old cookies', async () => {
      const scope = nock(url).post(path).reply(200, success);
      const timestamp = Date.now();
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      document.cookie = `amp_${apiKey.substring(0, 6)}=deviceId.${encodedUserId}..${time}.${time}`;
      await client.init(apiKey, undefined, {
        ...opts,
        cookieUpgrade: false,
      }).promise;
      const response = await client.track('test event', {
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
      expect(document.cookie.includes('amp_')).toBe(true);
      scope.done();
    });
  });

  describe('custom config', () => {
    describe('serverUrl', () => {
      test('should track event to custom serverUrl', async () => {
        const serverUrl = 'https://domain.com';
        const scope = nock(serverUrl).post(path).reply(200, success);

        await client.init(apiKey, undefined, {
          ...opts,
          serverUrl: serverUrl + path,
        }).promise;
        const response = await client.track('test event').promise;
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

    describe('debug mode', () => {
      test('should enable debug mode for track', async () => {
        const scope = nock(url).post(path).reply(200, success);

        const logger = {
          disable: jest.fn(),
          enable: jest.fn(),
          debug: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        };
        await client.init(apiKey, undefined, {
          ...opts,
          loggerProvider: logger,
          logLevel: LogLevel.Debug,
        }).promise;

        const response = await client.track('test event').promise;
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

        expect(logger.debug).toHaveBeenCalledTimes(1);
        /* eslint-disable */
        const debugContext = JSON.parse(logger.debug.mock.calls[0]);
        expect(debugContext.type).toBeDefined();
        expect(debugContext.name).toEqual('track');
        expect(debugContext.args).toBeDefined();
        expect(debugContext.stacktrace).toBeDefined();
        expect(debugContext.time).toBeDefined();
        expect(debugContext.states).toBeDefined();
        /* eslint-enable */
      });

      test('should enable debug mode for setOptOut', async () => {
        const logger = {
          disable: jest.fn(),
          enable: jest.fn(),
          debug: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        };
        await client.init(apiKey, undefined, {
          ...opts,
          loggerProvider: logger,
          logLevel: LogLevel.Debug,
        }).promise;
        client.setOptOut(true);

        expect(logger.debug).toHaveBeenCalledTimes(1);
        /* eslint-disable */
        const debugContext = JSON.parse(logger.debug.mock.calls[0]);
        expect(debugContext.type).toBeDefined();
        expect(debugContext.name).toEqual('setOptOut');
        expect(debugContext.args).toBeDefined();
        expect(debugContext.stacktrace).toBeDefined();
        expect(debugContext.time).toBeDefined();
        expect(debugContext.states).toBeDefined();
        /* eslint-enable */
      });
    });
  });
});
