import { getDecodeURI, isUrlMatchAllowlist } from '../../src/';

describe('isUrlMatchAllowlist', () => {
  const url = 'https://amplitude.com/blog';

  test('should return true when allow list is not provided', () => {
    const result = isUrlMatchAllowlist(url, undefined);
    expect(result).toEqual(true);
  });

  test('should return true when allow list is empty', () => {
    const result = isUrlMatchAllowlist(url, []);
    expect(result).toEqual(true);
  });

  test('should return true only when full url string is in the allow list', () => {
    let result = isUrlMatchAllowlist(url, ['https://amplitude.com/blog']);
    expect(result).toEqual(true);

    result = isUrlMatchAllowlist('https://amplitude.com/market', ['https://amplitude.com/blog']);
    expect(result).toEqual(false);
  });

  test('should return true when url regex is in the allow list', () => {
    let result = isUrlMatchAllowlist(url, [new RegExp('https://amplitude.com/')]);
    expect(result).toEqual(true);

    result = isUrlMatchAllowlist('https://amplitude.com/market', [new RegExp('https://amplitude.com/')]);
    expect(result).toEqual(true);
  });

  test('should return false when url is not in the allow list at all', () => {
    const result = isUrlMatchAllowlist(url, ['https://test.com', new RegExp('https://test.com/')]);
    expect(result).toEqual(false);
  });

  test('should return true when url is matching an item in the allow list with regex wildcard', () => {
    const result = isUrlMatchAllowlist(url, [new RegExp('http.?://amplitude.*'), new RegExp('http.?://test.*')]);
    expect(result).toEqual(true);
  });
});

describe('getDecodeURI', () => {
  test('should decode URI', () => {
    const result = getDecodeURI('https://www.topps.com/products/2025-bowman-chrome%C2%AE-baseball-mega-box');
    expect(result).toEqual('https://www.topps.com/products/2025-bowman-chrome®-baseball-mega-box');
  });
});
