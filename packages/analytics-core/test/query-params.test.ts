/**
 * @jest-environment jsdom
 */

import { getQueryParams, tryDecodeURIComponent } from '../src/query-params';
import * as GlobalScopeModule from '../src/global-scope';

describe('query-params', () => {
  test('should decode a missing component as an empty string', () => {
    expect(tryDecodeURIComponent()).toBe('');
  });

  describe('getQueryParams', () => {
    beforeAll(() => {
      Object.defineProperty(window, 'location', {
        value: {
          search: '',
          writable: true,
        },
      });
    });

    afterAll(() => {
      Object.defineProperty(window, 'location', {
        value: {
          search: '',
          writable: false,
        },
      });
    });

    test('should parse query params', () => {
      window.location.search = '?a=1&b=2%20test&&c%24=hello&d';
      const params = getQueryParams();
      expect(params).toEqual({
        a: '1',
        b: '2 test',
        c$: 'hello',
      });
    });

    test.each([
      ['?utm_term=running+shoes', { utm_term: 'running shoes' }],
      ['?utm_term=C%2B%2B+tutorial', { utm_term: 'C++ tutorial' }],
      ['?a+b%2Bc=hello+world%2B', { 'a b+c': 'hello world+' }],
      ['?utm_content=a%3Db=c&gclid=abc==', { utm_content: 'a=b=c', gclid: 'abc==' }],
      ['?value==', { value: '=' }],
      ['?value=%252B', { value: '%2B' }],
    ])('should decode form query parameters in %s', (search, expected) => {
      window.location.search = search;
      expect(getQueryParams()).toEqual(expected);
    });

    test('should preserve empty value filtering and last nonempty duplicate value', () => {
      window.location.search = '?missing&empty=&value=first&value=last&value=';
      expect(getQueryParams()).toEqual({ value: 'last' });
    });

    test('should parse malformed uri', () => {
      window.location.search = '?fb=X+%EF%BF%BD%93+C';
      const params = getQueryParams();
      expect(params).toEqual({});
    });

    test('should handle undefined global scope', () => {
      jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValueOnce(undefined);
      const params = getQueryParams();
      expect(params).toEqual({});
    });
  });
});
