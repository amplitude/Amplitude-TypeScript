/**
 * @jest-environment jsdom
 */

import { getQueryParams } from '../src/query-params';
import * as GlobalScopeModule from '../src/global-scope';

describe('query-params', () => {
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

    test('should decode plus signs and preserve equals signs in values', () => {
      window.location.search =
        '?utm_source=news+letter&utm_term=running+shoes&literal_plus=%2B&gclid=abc==&utm_content=a%3Db=c&space=%20';
      expect(getQueryParams()).toEqual({
        utm_source: 'news letter',
        utm_term: 'running shoes',
        literal_plus: '+',
        gclid: 'abc==',
        utm_content: 'a=b=c',
        space: ' ',
      });
    });

    test('should omit empty values and parameters without equals signs', () => {
      window.location.search = '?empty=&missing&present=value';
      expect(getQueryParams()).toEqual({ present: 'value' });
    });

    test('should preserve last duplicate parameter value', () => {
      window.location.search = '?duplicate=first&duplicate=second';
      expect(getQueryParams()).toEqual({ duplicate: 'second' });
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
