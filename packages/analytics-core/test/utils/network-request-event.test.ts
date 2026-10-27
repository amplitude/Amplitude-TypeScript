import {
  createNetworkRequestEvent,
  formatNetworkRequestEvent,
  parseNetworkRequestUrl,
  NetworkRequestEventProperties,
} from '../../src';
import { createTrackEvent } from '../../src/utils/event-builder';

const request: NetworkRequestEventProperties = {
  url: 'https://example.com/orders?sort=recent#details',
  method: 'POST',
  statusCode: 503,
  startTime: 1700000000000,
  duration: 120.5,
};

describe('createNetworkRequestEvent', () => {
  test('constructs a completed request compatible with the existing track API', () => {
    const event = createNetworkRequestEvent(request);
    expect(createTrackEvent(event, undefined, { user_id: 'user' })).toEqual({
      event_type: '[Amplitude] Network Request',
      user_id: 'user',
      event_properties: {
        '[Amplitude] URL': 'https://example.com/orders',
        '[Amplitude] URL Query': 'sort=recent',
        '[Amplitude] URL Fragment': 'details',
        '[Amplitude] Request Method': 'POST',
        '[Amplitude] Status Code': 503,
        '[Amplitude] Start Time': 1700000000000,
        '[Amplitude] Completion Time': 1700000000120.5,
        '[Amplitude] Duration': 120.5,
        '[Amplitude] Request Type': 'custom',
      },
    });
  });

  test('maps every optional field without dropping zero or empty values', () => {
    const event = createNetworkRequestEvent({
      ...request,
      statusCode: 0,
      startTime: 0,
      duration: 0,
      requestType: 'xhr',
      error: { code: 0, message: '' },
      requestBodySize: 0,
      responseBodySize: 0,
      requestHeaders: {},
      responseHeaders: { 'content-type': 'application/json' },
      requestBody: '',
      responseBody: '{}',
    });
    expect(event.event_properties).toMatchObject({
      '[Amplitude] Status Code': 0,
      '[Amplitude] Start Time': 0,
      '[Amplitude] Completion Time': 0,
      '[Amplitude] Duration': 0,
      '[Amplitude] Request Type': 'xhr',
      '[Amplitude] Error Code': 0,
      '[Amplitude] Error Message': '',
      '[Amplitude] Request Body Size': 0,
      '[Amplitude] Response Body Size': 0,
      '[Amplitude] Request Headers': {},
      '[Amplitude] Response Headers': { 'content-type': 'application/json' },
      '[Amplitude] Request Body': '',
      '[Amplitude] Response Body': '{}',
    });
  });

  test('defaults absent status to zero and omits unavailable optional properties', () => {
    const event = createNetworkRequestEvent({ ...request, statusCode: undefined });
    expect(event.event_properties?.['[Amplitude] Status Code']).toBe(0);
    expect(Object.values(event.event_properties ?? {})).not.toContain(undefined);
    expect(event.event_properties).not.toHaveProperty('[Amplitude] Error Message');
    expect(event.event_properties).not.toHaveProperty('[Amplitude] Request Body');
  });

  test.each([200, 404, 500])('does not apply Autocapture status filters to %i', (statusCode) => {
    const event = createNetworkRequestEvent({ ...request, statusCode });
    expect(event.event_properties?.['[Amplitude] Status Code']).toBe(statusCode);
  });

  test('preserves original URL parsing and leaves the input unchanged', () => {
    const properties = Object.freeze({ ...request, url: 'https://user:secret@example.com/orders?q=one#two' });
    const event = createNetworkRequestEvent(properties);
    expect(event.event_properties?.['[Amplitude] URL']).toBe('https://user:secret@example.com/orders');
    expect(JSON.stringify(event)).toContain('secret');
    expect(properties.url).toContain('user:secret@');
  });

  test.each(['url', 'method'] as const)('rejects an empty %s', (key) => {
    expect(() => createNetworkRequestEvent({ ...request, [key]: '  ' })).toThrow(TypeError);
  });

  test.each([
    { startTime: NaN },
    { startTime: Infinity },
    { startTime: -1 },
    { duration: NaN },
    { duration: Infinity },
    { duration: -1 },
    { startTime: Number.MAX_VALUE, duration: Number.MAX_VALUE },
  ])('rejects invalid timing %j', (timing) => {
    expect(() => createNetworkRequestEvent({ ...request, ...timing })).toThrow(RangeError);
  });
});

test('formats captured observations without changing optional timing or validating them again', () => {
  const event = formatNetworkRequestEvent({
    url: parseNetworkRequestUrl('https://example.com/orders')!,
    method: ' ',
    statusCode: 0,
    startTime: -1,
    completionTime: 12,
    requestType: 'fetch',
  });
  expect(event.event_properties).toStrictEqual({
    '[Amplitude] URL': 'https://example.com/orders',
    '[Amplitude] URL Query': '',
    '[Amplitude] URL Fragment': '',
    '[Amplitude] Request Method': ' ',
    '[Amplitude] Status Code': 0,
    '[Amplitude] Start Time': -1,
    '[Amplitude] Completion Time': 12,
    '[Amplitude] Duration': undefined,
    '[Amplitude] Request Body Size': undefined,
    '[Amplitude] Response Body Size': undefined,
    '[Amplitude] Request Type': 'fetch',
    '[Amplitude] Request Headers': undefined,
    '[Amplitude] Response Headers': undefined,
  });
});
