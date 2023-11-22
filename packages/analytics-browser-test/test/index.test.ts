/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { default as nock } from 'nock';
import { success } from './responses';
import 'isomorphic-fetch';
import { path, SUCCESS_MESSAGE, url, uuidPattern } from './constants';
import { LogLevel } from '@amplitude/analytics-types';
import { UUID } from '@amplitude/analytics-core';

describe('integration', () => {
  const uuid: string = expect.stringMatching(uuidPattern) as string;
  const library = expect.stringMatching(/^amplitude-ts\/.+/) as string;
  const number = expect.any(Number) as number;
  const userAgent = expect.any(String) as string;
  const defaultTracking = {
    attribution: false,
    fileDownloads: false,
    formInteractions: false,
    pageViews: false,
    sessions: false,
  };

  let apiKey = '';
  let client = amplitude.createInstance();

  const event_upload_time = '2023-01-01T12:00:00:000Z';
  Date.prototype.toISOString = jest.fn(() => event_upload_time);

  beforeEach(() => {
    client = amplitude.createInstance();
    apiKey = UUID();
  });

  afterEach(() => {
    // clean up cookies
    document.cookie = `amp_${apiKey.substring(0, 6)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    document.cookie = `AMP_${apiKey.substring(0, 10)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    document.cookie = `AMP_MKTG_${apiKey.substring(0, 10)}=null; expires=1 Jan 1970 00:00:00 GMT`;
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
          type: 'enrichment',
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
            event_id: 1,
            event_type: 'Event Before Init',
            insert_id: uuid,
            ip: '$remote',
            language: 'en-US',
            library: library,
            partner_id: undefined,
            plan: undefined,
            ingestion_metadata: undefined,
            platform: platform, // NOTE: Session ID was set using a plugin added before init
            session_id: sessionId, // NOTE: Session ID was set before init
            time: number,
            user_id: userId, // NOTE: User ID was set before init
            user_agent: userAgent,
          });
          expect(response.code).toBe(200);
          expect(response.message).toBe(SUCCESS_MESSAGE);
          scope.done();
          resolve(undefined);
        });
        client.init(apiKey, {
          defaultTracking,
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
      await client.init(apiKey, {
        defaultTracking: {
          ...defaultTracking,
          attribution: true,
          pageViews: {
            trackOn: 'attribution',
          },
        },
      }).promise;
      await trackPromise;

      expect(requestBody1).toEqual({
        api_key: apiKey,
        client_upload_time: event_upload_time,
        events: [
          {
            device_id: deviceId,
            session_id: sessionId,
            user_id: userId,
            time: number,
            platform: 'Web',
            language: 'en-US',
            ip: '$remote',
            insert_id: uuid,
            event_type: '[Amplitude] Page Viewed',
            event_properties: {
              '[Amplitude] Page Domain': '',
              '[Amplitude] Page Location': '',
              '[Amplitude] Page Path': '',
              '[Amplitude] Page Title': '',
              '[Amplitude] Page URL': '',
            },
            user_agent: userAgent,
            user_properties: {
              $setOnce: {
                initial_dclid: 'EMPTY',
                initial_fbclid: 'EMPTY',
                initial_gbraid: 'EMPTY',
                initial_gclid: 'EMPTY',
                initial_ko_click_id: 'EMPTY',
                initial_li_fat_id: 'EMPTY',
                initial_msclkid: 'EMPTY',
                initial_referrer: 'EMPTY',
                initial_referring_domain: 'EMPTY',
                initial_rtd_cid: 'EMPTY',
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
                li_fat_id: '-',
                msclkid: '-',
                referrer: '-',
                referring_domain: '-',
                rtd_cid: '-',
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
            event_id: 1,
            library: library,
          },
          {
            device_id: deviceId,
            session_id: sessionId,
            user_id: userId,
            time: number,
            platform: 'Web',
            language: 'en-US',
            ip: '$remote',
            insert_id: uuid,
            event_type: 'Event Before Init',
            event_id: 2,
            library: library,
            user_agent: userAgent,
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

      await client.init(apiKey, {
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 1,
        event_properties: {
          mode: 'test',
        },
        library: library,
        user_agent: userAgent,
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
        defaultTracking,
      }).promise;
      const response = await client.track('test event').promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        session_id: 1,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with event options', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await client.init(apiKey, {
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with optional ingestionMetadata option', async () => {
      const scope = nock(url).post(path).reply(200, success);

      const sourceName = 'ampli';
      const sourceVersion = '2.0.0';
      await client.init(apiKey, {
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 1,
        library: library,
        ingestion_metadata: {
          source_name: sourceName,
          source_version: sourceVersion,
        },
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });

    test('should track event with base event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      await client.init(apiKey, {
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 1,
        library: library,
        groups: {
          org: '15',
        },
        user_agent: userAgent,
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

      await client.init(apiKey, {
        logLevel: 0,
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: undefined,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 2,
        library: library,
        user_agent: userAgent,
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

      await client.init(apiKey, {
        logLevel: 0,
        flushQueueSize: 2,
        defaultTracking,
      }).promise;
      const response = await Promise.all([client.track('test event 1').promise, client.track('test event 2').promise]);
      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 2,
        library: library,
        user_agent: userAgent,
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

      await client.init(apiKey, {
        logLevel: 0,
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: 'throttled_device_id',
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 2,
        library: library,
        user_agent: userAgent,
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

      await client.init(apiKey, {
        logLevel: 0,
        defaultTracking,
      }).promise;
      const response = await Promise.all([client.track('test event 1').promise, client.track('test event 2').promise]);
      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 2,
        library: library,
        user_agent: userAgent,
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

      await client.init(apiKey, {
        logLevel: 0,
        flushMaxRetries: 3,
        defaultTracking,
      }).promise;
      const response = await client.track('test event').promise;
      expect(response.event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(500);
      expect(response.message).toBe('Event rejected due to exceeded retry count');
      scope.done();
    }, 10000);

    test('should handle missing api key', async () => {
      await client.init('', undefined, {
        logLevel: 0,
        defaultTracking,
      }).promise;
      const response = await client.track('test event').promise;
      expect(response.code).toBe(400);
      expect(response.message).toBe('Event rejected due to missing API key');
      document.cookie = `AMP=null; expires=1 Jan 1970 00:00:00 GMT`;
    });

    test('should handle client opt out', async () => {
      await client.init(apiKey, {
        logLevel: 0,
        defaultTracking,
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

      await client.init(apiKey, {
        defaultTracking,
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
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: '$identify',
        event_id: 1,
        library: library,
        user_agent: userAgent,
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

      await client.init(apiKey, {
        defaultTracking,
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
        event_id: 1,
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
        partner_id: undefined,
        platform: 'Web',
        session_id: number,
        time: number,
        user_agent: userAgent,
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

      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const response = await client.setGroup('org', 'engineering').promise;
      expect(response.event).toEqual({
        device_id: uuid,
        event_id: 1,
        event_type: '$identify',
        groups: {
          org: 'engineering',
        },
        insert_id: uuid,
        ip: '$remote',
        language: 'en-US',
        library: library,
        partner_id: undefined,
        platform: 'Web',
        session_id: number,
        time: number,
        user_agent: userAgent,
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
    const previousSessionId = Date.now() - 31 * 60 * 1000; // now minus 31 minutes
    const previousSessionLastEventTime = Date.now() - 31 * 60 * 1000; // now minus 31 minutes
    const previousSessionLastEventId = 99;
    const previousSessionDeviceId = 'a7a96s8d';
    const previousSessionUserId = 'a7a96s8d';
    beforeEach(() => {
      // setup expired previous session
      setLegacyCookie(
        apiKey,
        previousSessionDeviceId,
        previousSessionUserId,
        undefined,
        previousSessionId,
        previousSessionLastEventTime,
        previousSessionLastEventId,
      );
    });

    test('should send session events and replace with known user', () => {
      let payload: any = undefined;
      const scope = nock(url)
        .post(path, (body: Record<string, any>) => {
          payload = body;
          return true;
        })
        .reply(200, success);
      client.init(apiKey, 'user1@amplitude.com', {
        deviceId: UUID(),
        defaultTracking: {
          ...defaultTracking,
          attribution: true,
          sessions: true,
        },
        sessionTimeout: 500,
        flushIntervalMillis: 3000,
      });
      // Sends `session_start` event
      client.track('Event in first session');

      setTimeout(() => {
        client.track('Event in next session');
        // Sends `session_end` event for previous session
        // Sends `session_start` event for next session
      }, 1000);

      setTimeout(() => {
        client.setUserId('user2@amplitude.com');
      }, 2000);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(payload).toEqual({
            api_key: apiKey,
            client_upload_time: event_upload_time,
            events: [
              {
                // This is a `session_end` event for the previous session
                device_id: previousSessionDeviceId,
                event_id: 100,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: previousSessionId,
                time: previousSessionId + 1,
                user_agent: userAgent,
                user_id: previousSessionUserId,
              },
              {
                device_id: uuid,
                event_id: 101,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
                user_properties: {
                  $setOnce: {
                    initial_dclid: 'EMPTY',
                    initial_fbclid: 'EMPTY',
                    initial_gbraid: 'EMPTY',
                    initial_gclid: 'EMPTY',
                    initial_ko_click_id: 'EMPTY',
                    initial_li_fat_id: 'EMPTY',
                    initial_msclkid: 'EMPTY',
                    initial_referrer: 'EMPTY',
                    initial_referring_domain: 'EMPTY',
                    initial_rtd_cid: 'EMPTY',
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
                    li_fat_id: '-',
                    msclkid: '-',
                    referrer: '-',
                    referring_domain: '-',
                    rtd_cid: '-',
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
                event_id: 103,
                event_type: 'Event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 104,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 105,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 106,
                event_type: 'Event in next session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
            ],
            options: {
              min_id_length: undefined,
            },
          });
          scope.done();
          resolve();
        }, 4000);
      });
    });

    test('should send session events and replace with unknown user', () => {
      // Reset previous session cookies
      document.cookie = `amp_${apiKey.substring(0, 6)}=null; expires=1 Jan 1970 00:00:00 GMT`;

      let payload: any = undefined;
      const scope = nock(url)
        .post(path, (body: Record<string, any>) => {
          payload = body;
          return true;
        })
        .reply(200, success);
      client.init(apiKey, 'user1@amplitude.com', {
        defaultTracking: {
          ...defaultTracking,
          attribution: true,
          sessions: true,
        },
        sessionTimeout: 500,
        flushIntervalMillis: 3000,
      });
      // Sends `session_start` event
      client.track('Event in first session');

      setTimeout(() => {
        client.track('Event in next session');
        // Sends `session_end` event for previous session
        // Sends `session_start` event for next session
      }, 1000);

      setTimeout(() => {
        client.reset();
      }, 2000);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const deviceId0 = payload.events[0].device_id;
          [
            payload.events[1].device_id,
            payload.events[2].device_id,
            payload.events[3].device_id,
            payload.events[4].device_id,
          ].forEach((deviceId) => {
            expect(deviceId).toEqual(deviceId0);
          });
          const sessionId0 = payload.events[0].session_id;
          [payload.events[1].session_id, payload.events[2].session_id].forEach((sessionId) => {
            expect(sessionId).toEqual(sessionId0);
          });
          expect(sessionId0).not.toEqual(payload.events[3].session_id);
          expect(payload.events[3].session_id).toEqual(payload.events[4].session_id);
          expect(payload).toEqual({
            api_key: apiKey,
            client_upload_time: event_upload_time,
            events: [
              {
                device_id: uuid,
                event_id: 1,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
                user_properties: {
                  $setOnce: {
                    initial_dclid: 'EMPTY',
                    initial_fbclid: 'EMPTY',
                    initial_gbraid: 'EMPTY',
                    initial_gclid: 'EMPTY',
                    initial_ko_click_id: 'EMPTY',
                    initial_li_fat_id: 'EMPTY',
                    initial_msclkid: 'EMPTY',
                    initial_referrer: 'EMPTY',
                    initial_referring_domain: 'EMPTY',
                    initial_rtd_cid: 'EMPTY',
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
                    li_fat_id: '-',
                    msclkid: '-',
                    referrer: '-',
                    referring_domain: '-',
                    rtd_cid: '-',
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
                event_id: 3,
                event_type: 'Event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 4,
                event_type: 'session_end',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 5,
                event_type: 'session_start',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 6,
                event_type: 'Event in next session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
            ],
            options: {
              min_id_length: undefined,
            },
          });
          scope.done();
          resolve();
        }, 4000);
      });
    });

    test('should extend session with new event', () => {
      let payload: any = undefined;
      const scope = nock(url)
        .post(path, (body: Record<string, any>) => {
          payload = body;
          return true;
        })
        .reply(200, success);
      client.init(apiKey, 'user1@amplitude.com', {
        deviceId: UUID(),
        defaultTracking: {
          ...defaultTracking,
        },
        sessionId: 1,
        sessionTimeout: 1000,
        flushIntervalMillis: 3000,
      });
      client.track('First event in first session');

      setTimeout(() => {
        // Track event before first session expires
        client.track('Second event in first session');
      }, 800);

      setTimeout(() => {
        // Track event before extended session expires
        // Without second event, session should have expired
        client.track('Third event in first session');
      }, 1600);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(payload).toEqual({
            api_key: apiKey,
            client_upload_time: event_upload_time,
            events: [
              {
                device_id: uuid,
                event_id: 100,
                event_type: 'First event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: 1,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 101,
                event_type: 'Second event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: 1,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
              {
                device_id: uuid,
                event_id: 102,
                event_type: 'Third event in first session',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: 1,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
            ],
            options: {
              min_id_length: undefined,
            },
          });
          scope.done();
          resolve();
        }, 4000);
      });
    });

    test('should handle expired session', async () => {
      const scope = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const response = await client.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event.session_id).not.toBe(previousSessionId);
      expect(response.event).toEqual({
        user_id: previousSessionUserId,
        device_id: previousSessionDeviceId,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 100,
        event_properties: {
          mode: 'test',
        },
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      expect(document.cookie.includes('amp_')).toBe(false);
      scope.done();
    });

    test('should handle expired session and set with options.sessionId', async () => {
      const scope = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        defaultTracking,
        sessionId: 1,
      }).promise;
      const response = await client.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event.session_id).toBe(1);
      expect(response.event).toEqual({
        user_id: previousSessionUserId,
        device_id: previousSessionDeviceId,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 100,
        event_properties: {
          mode: 'test',
        },
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      expect(document.cookie.includes('amp_')).toBe(false);
      scope.done();
    });

    test('should handle expired session and set with setSessionId', async () => {
      const scope = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      client.setSessionId(1);
      const response = await client.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event).toEqual({
        user_id: previousSessionUserId,
        device_id: previousSessionDeviceId,
        session_id: 1,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 100,
        event_properties: {
          mode: 'test',
        },
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      expect(document.cookie.includes('amp_')).toBe(false);
      scope.done();
    });
  });

  describe('default page view tracking', () => {
    test('should send page view on attribution', () => {
      let payload: any = undefined;
      const scope = nock(url)
        .post(path, (body: Record<string, any>) => {
          payload = body;
          return true;
        })
        .reply(200, success);
      client.init(apiKey, 'user1@amplitude.com', {
        defaultTracking: {
          ...defaultTracking,
          attribution: true,
          pageViews: {
            trackOn: 'attribution',
          },
        },
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(payload).toEqual({
            api_key: apiKey,
            client_upload_time: event_upload_time,
            events: [
              {
                device_id: uuid,
                event_id: 1,
                event_properties: {
                  '[Amplitude] Page Domain': '',
                  '[Amplitude] Page Location': '',
                  '[Amplitude] Page Path': '',
                  '[Amplitude] Page Title': '',
                  '[Amplitude] Page URL': '',
                },
                event_type: '[Amplitude] Page Viewed',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
                user_properties: {
                  $setOnce: {
                    initial_dclid: 'EMPTY',
                    initial_fbclid: 'EMPTY',
                    initial_gbraid: 'EMPTY',
                    initial_gclid: 'EMPTY',
                    initial_ko_click_id: 'EMPTY',
                    initial_li_fat_id: 'EMPTY',
                    initial_msclkid: 'EMPTY',
                    initial_referrer: 'EMPTY',
                    initial_referring_domain: 'EMPTY',
                    initial_rtd_cid: 'EMPTY',
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
                    li_fat_id: '-',
                    msclkid: '-',
                    referrer: '-',
                    referring_domain: '-',
                    rtd_cid: '-',
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
            ],
            options: {
              min_id_length: undefined,
            },
          });
          scope.done();
          resolve();
        }, 2000);
      });
    });

    test('should send page view', () => {
      let payload: any = undefined;
      const scope = nock(url)
        .post(path, (body: Record<string, any>) => {
          payload = body;
          return true;
        })
        .reply(200, success);
      client.init(apiKey, 'user1@amplitude.com', {
        defaultTracking: {
          ...defaultTracking,
          pageViews: true,
        },
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(payload).toEqual({
            api_key: apiKey,
            client_upload_time: event_upload_time,
            events: [
              {
                device_id: uuid,
                event_id: 1,
                event_properties: {
                  '[Amplitude] Page Domain': '',
                  '[Amplitude] Page Location': '',
                  '[Amplitude] Page Path': '',
                  '[Amplitude] Page Title': '',
                  '[Amplitude] Page URL': '',
                },
                event_type: '[Amplitude] Page Viewed',
                insert_id: uuid,
                ip: '$remote',
                language: 'en-US',
                library,
                partner_id: undefined,
                plan: undefined,
                platform: 'Web',
                session_id: number,
                time: number,
                user_agent: userAgent,
                user_id: 'user1@amplitude.com',
              },
            ],
            options: {
              min_id_length: undefined,
            },
          });
          scope.done();
          resolve();
        }, 2000);
      });
    });
  });

  describe('cookie migration', () => {
    const previousSessionId = Date.now(); // now minus 31 minutes
    const previousSessionLastEventTime = Date.now(); // now minus 31 minutes
    const previousSessionLastEventId = 99;
    const previousSessionDeviceId = 'deviceId';
    const previousSessionUserId = 'userId';

    beforeEach(() => {
      // setup expired previous session
      setLegacyCookie(
        apiKey,
        previousSessionDeviceId,
        previousSessionUserId,
        undefined,
        previousSessionId,
        previousSessionLastEventTime,
        previousSessionLastEventId,
      );
    });

    test('should use old cookies', async () => {
      const scope = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        defaultTracking,
      }).promise;
      const response = await client.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event).toEqual({
        user_id: previousSessionUserId,
        device_id: previousSessionDeviceId,
        session_id: previousSessionId,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 100,
        event_properties: {
          mode: 'test',
        },
        library: library,
        user_agent: userAgent,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      expect(document.cookie.includes('amp_')).toBe(false);
      scope.done();
    });

    test('should retain old cookies', async () => {
      const scope = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        defaultTracking,
        cookieOptions: {
          upgrade: false,
        },
      }).promise;
      const response = await client.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event).toEqual({
        user_id: previousSessionUserId,
        device_id: previousSessionDeviceId,
        session_id: previousSessionId,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event',
        event_id: 100,
        event_properties: {
          mode: 'test',
        },
        library: library,
        user_agent: userAgent,
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

        await client.init(apiKey, {
          defaultTracking,
          serverUrl: serverUrl + path,
        }).promise;
        const response = await client.track('test event').promise;
        expect(response.event).toEqual({
          user_id: undefined,
          device_id: uuid,
          session_id: number,
          time: number,
          platform: 'Web',
          language: 'en-US',
          ip: '$remote',
          insert_id: uuid,
          partner_id: undefined,
          event_type: 'test event',
          event_id: 1,
          library: library,
          user_agent: userAgent,
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
        await client.init(apiKey, {
          defaultTracking,
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
          language: 'en-US',
          ip: '$remote',
          insert_id: uuid,
          partner_id: undefined,
          event_type: 'test event',
          event_id: 1,
          library: library,
          user_agent: userAgent,
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
        await client.init(apiKey, {
          defaultTracking,
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

  describe('browser cookie existence', () => {
    test('should create cookies', async () => {
      // intercept for attribution event and identify event
      const scope1 = nock(url).post(path).reply(200, success);
      // intercept for test event
      const scope2 = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        identityStorage: 'cookie',
      }).promise;
      await client.identify(new amplitude.Identify().set('a', 'b')).promise;
      await client.track('Test Event').promise;
      expect(document.cookie).toContain(`AMP_${apiKey.substring(0, 10)}`);
      expect(document.cookie).toContain(`AMP_MKTG_${apiKey.substring(0, 10)}`);
      scope1.done();
      scope2.done();
    });

    test('should not create cookies', async () => {
      // intercept for attribution event and identify event
      const scope1 = nock(url).post(path).reply(200, success);
      // intercept for test event
      const scope2 = nock(url).post(path).reply(200, success);
      await client.init(apiKey, {
        identityStorage: 'localStorage',
      }).promise;
      await client.identify(new amplitude.Identify().set('a', 'b')).promise;
      await client.track('Test Event').promise;
      expect(document.cookie).not.toContain(`AMP_${apiKey.substring(0, 10)}`);
      expect(document.cookie).not.toContain(`AMP_MKTG_${apiKey.substring(0, 10)}`);
      scope1.done();
      scope2.done();
    });
  });
});

const setLegacyCookie = (
  apiKey: string,
  deviceId?: string,
  userId?: string,
  optOut?: '1',
  sessionId?: number,
  lastEventTime?: number,
  eventId?: number,
) => {
  document.cookie = `amp_${apiKey.substring(0, 6)}=${[
    deviceId,
    btoa(userId || ''),
    optOut,
    sessionId ? sessionId.toString(32) : '',
    lastEventTime ? lastEventTime.toString(32) : '',
    eventId ? eventId.toString(32) : '',
  ].join('.')}`;
};
