import * as amplitude from '@amplitude/analytics-node';
import { default as nock } from 'nock';
import { success } from './responses';
import { path, SUCCESS_MESSAGE, url, uuidPattern } from './constants';
import { LogLevel } from '@amplitude/analytics-types';

describe('integration', () => {
  const uuid: string = expect.stringMatching(uuidPattern) as string;
  const library = expect.stringMatching(/^amplitude-node-ts\/.+/) as string;
  const number = expect.any(Number) as number;
  const opts = {
    flushIntervalMillis: 1000,
  };

  describe('track', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      amplitude.init('API_KEY', opts);
      const response = await amplitude.track('test event', {
        mode: 'test',
      }).promise;
      expect(response.event).toEqual({
        time: number,
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

    test('should track event with event options', async () => {
      const scope = nock(url).post(path).reply(200, success);

      amplitude.init('API_KEY', opts);
      const response = await amplitude.track('test event', undefined, {
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
      }).promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        time: number,
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

    test('should track event when init is called after', async () => {
      const scope = nock(url).post(path).reply(200, success);

      const pendingResponse = amplitude.track('test event', undefined, {
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
      }).promise;
      await amplitude.init('API_KEY', opts).promise;
      const response = await pendingResponse;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        time: number,
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

    test('should track event with base event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      amplitude.init('API_KEY', opts);
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
        },
      ).promise;
      expect(response.event).toEqual({
        user_id: 'sdk.dev@amplitude.com',
        device_id: 'deviceId',
        time: number,
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

      amplitude.init('API_KEY', {
        ...opts,
        logLevel: 0,
      });
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2', undefined, {
          device_id: undefined,
        }).promise,
      ]);
      expect(response[0].event).toEqual({
        time: number,
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
        time: number,
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

      amplitude.init('API_KEY', {
        ...opts,
        logLevel: 0,
        flushQueueSize: 2,
      });
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2').promise,
      ]);
      expect(response[0].event).toEqual({
        time: number,
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        time: number,
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

      amplitude.init('API_KEY', {
        ...opts,
        logLevel: 0,
      });
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2', undefined, {
          device_id: 'throttled_device_id',
        }).promise,
      ]);
      expect(response[0].event).toEqual({
        time: number,
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        device_id: 'throttled_device_id',
        time: number,
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

      amplitude.init('API_KEY', {
        ...opts,
        logLevel: 0,
      });
      const response = await Promise.all([
        amplitude.track('test event 1').promise,
        amplitude.track('test event 2').promise,
      ]);
      expect(response[0].event).toEqual({
        time: number,
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
      });
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        time: number,
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

      amplitude.init('API_KEY', {
        ...opts,
        logLevel: 0,
        flushMaxRetries: 3,
      });
      const response = await amplitude.track('test event').promise;
      expect(response.event).toEqual({
        time: number,
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
      amplitude.init('', {
        ...opts,
        logLevel: 0,
      });
      const response = await amplitude.track('test event').promise;
      expect(response.code).toBe(400);
      expect(response.message).toBe('Event rejected due to missing API key');
    });

    test('should handle client opt out', async () => {
      amplitude.init('API_KEY', {
        ...opts,
        logLevel: 0,
      });
      amplitude.setOptOut(true);
      const response = await amplitude.track('test event').promise;
      expect(response.code).toBe(0);
      expect(response.message).toBe('Event skipped due to optOut config');
    });
  });

  describe('identify', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      amplitude.init('API_KEY', opts);
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
        time: number,
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

      amplitude.init('API_KEY', opts);
      const rev = new amplitude.Revenue();
      rev.setProductId('1');
      rev.setQuantity(1);
      rev.setPrice(100);
      rev.setRevenueType('t');
      rev.setRevenue(200);
      const response = await amplitude.revenue(rev).promise;
      expect(response.event).toEqual({
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
        library: library,
        partner_id: undefined,
        time: number,
      });
      expect(response.code).toBe(200);
      expect(response.message).toBe(SUCCESS_MESSAGE);
      scope.done();
    });
  });

  describe('setGroup', () => {
    test('should track event', async () => {
      const scope = nock(url).post(path).reply(200, success);

      amplitude.init('API_KEY', opts);
      const response = await amplitude.setGroup('org', 'engineering').promise;
      expect(response.event).toEqual({
        event_id: 0,
        event_type: '$identify',
        groups: {
          org: 'engineering',
        },
        insert_id: uuid,
        library: library,
        partner_id: undefined,
        time: number,
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

  describe('custom config', () => {
    describe('serverUrl', () => {
      test('should track event to custom serverUrl', async () => {
        const serverUrl = 'https://domain.com';
        const scope = nock(serverUrl).post(path).reply(200, success);

        amplitude.init('API_KEY', {
          ...opts,
          serverUrl: serverUrl + path,
        });
        const response = await amplitude.track('test event').promise;
        expect(response.event).toEqual({
          time: number,
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
        amplitude.init('API_KEY', { ...opts, loggerProvider: logger, logLevel: LogLevel.Debug });

        const response = await amplitude.track('test event', {
          mode: 'test',
        }).promise;
        expect(response.event).toEqual({
          time: number,
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
        amplitude.init('API_KEY', { ...opts, loggerProvider: logger, logLevel: LogLevel.Debug });
        amplitude.setOptOut(true);

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
