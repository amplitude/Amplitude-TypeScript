import { getQueryParams } from '../../src/utils/query-params';
import { isWeb } from '../../src/utils/platform';

describe('query-params', () => {
  describe('getQueryParams', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: {
          search: '?a=1&b=2%20test&&c%24=hello&d',
        },
      });
    });

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: undefined,
      });
    });

    /*
     * Tested function is only available on web.
     */
    if (isWeb()) {
      test('should parse query params', () => {
        const params = getQueryParams();
        expect(params).toEqual({
          a: '1',
          b: '2 test',
          c$: 'hello',
        });
      });
    } else {
      test('empty test case so jest doesnt fail', () => {
        //
      });
    }
  });
});
