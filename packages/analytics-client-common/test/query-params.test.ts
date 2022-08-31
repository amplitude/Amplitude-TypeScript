import { getQueryParams } from '../src/query-params';

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

    test('should parse malformed uri', () => {
      window.location.search = '?fb=X+%EF%BF%BD%93+C';
      const params = getQueryParams();
      expect(params).toEqual({});
    });
  });
});
