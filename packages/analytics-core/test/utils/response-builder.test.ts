import { Status } from '@amplitude/analytics-types';
import { buildResponse } from '../../src/utils/response-builder';

describe('response-builder', () => {
  test('should handle malformed input', () => {
    // Simulates a malformed input at runtime
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const response = buildResponse('');
    expect(response).toBe(null);
  });

  describe('success', () => {
    test('should return success response', () => {
      const response = buildResponse({
        code: 200,
        events_ingested: 1,
        payload_size_bytes: 1,
        server_upload_time: 1,
      });
      expect(response).toEqual({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 1,
          payloadSizeBytes: 1,
          serverUploadTime: 1,
        },
      });
    });

    test('should return success response with default values', () => {
      const response = buildResponse({
        code: 200,
      });
      expect(response).toEqual({
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: 0,
          payloadSizeBytes: 0,
          serverUploadTime: 0,
        },
      });
    });
  });

  describe('invalid response', () => {
    test('should return invalid response', () => {
      const response = buildResponse({
        code: 400,
        error: 'error',
        missing_field: 'field',
        events_with_invalid_fields: { a: 1 },
        events_with_missing_fields: { a: 2 },
        events_with_invalid_id_lengths: {},
        eps_threshold: 1,
        exceeded_daily_quota_devices: { a: 3 },
        silenced_devices: ['a'],
        silenced_events: [1],
        throttled_devices: { a: 4 },
        throttled_events: [1],
      });
      expect(response).toEqual({
        status: Status.Invalid,
        statusCode: 400,
        body: {
          error: 'error',
          missingField: 'field',
          eventsWithInvalidFields: { a: 1 },
          eventsWithMissingFields: { a: 2 },
          eventsWithInvalidIdLengths: {},
          epsThreshold: 1,
          exceededDailyQuotaDevices: { a: 3 },
          silencedDevices: ['a'],
          silencedEvents: [1],
          throttledDevices: { a: 4 },
          throttledEvents: [1],
        },
      });
    });

    test('should return invalid response with default values', () => {
      const response = buildResponse({
        code: 400,
      });
      expect(response).toEqual({
        status: Status.Invalid,
        statusCode: 400,
        body: {
          error: '',
          missingField: '',
          eventsWithInvalidFields: {},
          eventsWithMissingFields: {},
          eventsWithInvalidIdLengths: {},
          epsThreshold: 0,
          exceededDailyQuotaDevices: {},
          silencedDevices: [],
          silencedEvents: [],
          throttledDevices: {},
          throttledEvents: [],
        },
      });
    });
  });

  describe('pay load too large response', () => {
    test('should return payload too large response', () => {
      const response = buildResponse({
        code: 413,
        error: 'error',
      });
      expect(response).toEqual({
        status: Status.PayloadTooLarge,
        statusCode: 413,
        body: {
          error: 'error',
        },
      });
    });

    test('should return payload too large response wtih default values', () => {
      const response = buildResponse({
        code: 413,
      });
      expect(response).toEqual({
        status: Status.PayloadTooLarge,
        statusCode: 413,
        body: {
          error: '',
        },
      });
    });
  });

  describe('rate limit response', () => {
    test('should return rate limit response', () => {
      const response = buildResponse({
        code: 429,
        error: 'error',
        eps_threshold: 1,
        throttled_devices: { a: 1 },
        throttled_users: { b: 1 },
        exceeded_daily_quota_devices: { c: 1 },
        exceeded_daily_quota_users: { d: 1 },
        throttled_events: [1],
      });
      expect(response).toEqual({
        status: Status.RateLimit,
        statusCode: 429,
        body: {
          error: 'error',
          epsThreshold: 1,
          throttledDevices: { a: 1 },
          throttledUsers: { b: 1 },
          exceededDailyQuotaDevices: { c: 1 },
          exceededDailyQuotaUsers: { d: 1 },
          throttledEvents: [1],
        },
      });
    });

    test('should return rate limit response with default values', () => {
      const response = buildResponse({
        code: 429,
      });
      expect(response).toEqual({
        status: Status.RateLimit,
        statusCode: 429,
        body: {
          error: '',
          epsThreshold: 0,
          throttledDevices: {},
          throttledUsers: {},
          exceededDailyQuotaDevices: {},
          exceededDailyQuotaUsers: {},
          throttledEvents: [],
        },
      });
    });
  });

  describe('timeout', () => {
    test('should generic response', () => {
      const response = buildResponse({
        code: 408,
      });
      expect(response).toEqual({
        status: Status.Timeout,
        statusCode: 408,
      });
    });
  });

  describe('other error', () => {
    test('should generic response', () => {
      const response = buildResponse({
        code: 500,
      });
      expect(response).toEqual({
        status: Status.Failed,
        statusCode: 500,
      });
    });
  });

  describe('unknown error', () => {
    test('should generic response', () => {
      const response = buildResponse({});
      expect(response).toEqual({
        status: Status.Unknown,
        statusCode: 0,
      });
    });
  });
});
