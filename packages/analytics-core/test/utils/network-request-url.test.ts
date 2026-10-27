import * as globalScope from '../../src/global-scope';
import { parseNetworkRequestUrl, parseNetworkRequestUrlFromString, createNetworkRequestEvent } from '../../src';

describe('network request URL normalization', () => {
  const originalURL = global.URL;
  afterEach(() => {
    global.URL = originalURL;
    jest.restoreAllMocks();
  });

  test('omits missing URLs as before', () => {
    expect(parseNetworkRequestUrl(undefined)).toBeUndefined();
    expect(parseNetworkRequestUrl('')).toBeUndefined();
  });

  test('uses the original browser URL implementation when a location is available', () => {
    jest.spyOn(globalScope, 'getGlobalScope').mockReturnValue({
      location: { href: 'https://app.example.com/current/page' },
    } as typeof globalThis);
    expect(parseNetworkRequestUrl('https://user:password@example.com/path?foo=bar#hash')).toMatchObject({
      hrefWithoutQueryOrHash: 'https://user:password@example.com/path',
      host: 'example.com',
      query: 'foo=bar',
      fragment: 'hash',
    });
  });

  test('preserves credentials as the original parser did', () => {
    expect(parseNetworkRequestUrl('https://user:password@example.com/path?foo=bar#hash')).toMatchObject({
      hrefWithoutQueryOrHash: 'https://user:password@example.com/path',
      host: 'user:password@example.com',
      query: 'foo=bar',
      fragment: 'hash',
    });
  });

  test.each([
    ['http://10.0.2.2:5173/api/test', 'http://10.0.2.2:5173/api/test', '10.0.2.2:5173', '', ''],
    ['http://10.0.2.2:5173/api/test?foo=bar#hash', 'http://10.0.2.2:5173/api/test', '10.0.2.2:5173', 'foo=bar', 'hash'],
    ['/api/test', '/api/test', '', '', ''],
    ['/api/test#hash?query', '/api/test', '', '', 'hash?query'],
    [
      'https://user:secret@example.com/path?q=1#h',
      'https://user:secret@example.com/path',
      'user:secret@example.com',
      'q=1',
      'h',
    ],
    ['//user:secret@example.com/path', '//user:secret@example.com/path', '', '', ''],
  ])('parses %s without a URL implementation', (input, url, host, query, fragment) => {
    global.URL = undefined as unknown as typeof URL;
    const expected = { href: input, hrefWithoutQueryOrHash: url, host, query, fragment };
    expect(parseNetworkRequestUrl(input)).toEqual(expected);
    expect(parseNetworkRequestUrlFromString(input)).toEqual(expected);
    const event = createNetworkRequestEvent({ url: input, method: 'GET', startTime: 1000, duration: 10 });
    expect(event.event_properties?.['[Amplitude] URL']).toBe(url);
  });

  test('falls back when the React Native URL polyfill is incomplete', () => {
    global.URL = class {
      get searchParams(): never {
        throw new Error('not implemented');
      }
    } as unknown as typeof URL;
    expect(parseNetworkRequestUrl('http://10.0.2.2:5173/api/test?foo=bar')).toMatchObject({
      host: '10.0.2.2:5173',
      query: 'foo=bar',
      hrefWithoutQueryOrHash: 'http://10.0.2.2:5173/api/test',
    });
  });
});
