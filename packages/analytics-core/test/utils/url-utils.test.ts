import { isUrlMatchAllowlist, isUrlMatchExcludelist } from '../../src/';

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

describe('isUrlMatchExcludelist', () => {
  const url = 'https://amplitude.com/blog';

  test('should return false when exclude list is not provided', () => {
    const result = isUrlMatchExcludelist(url, undefined);
    expect(result).toEqual(false);
  });

  test('should return false when exclude list is empty', () => {
    const result = isUrlMatchExcludelist(url, []);
    expect(result).toEqual(false);
  });

  test('should return true only when full url string is in the exclude list', () => {
    let result = isUrlMatchExcludelist(url, ['https://amplitude.com/blog']);
    expect(result).toEqual(true);

    result = isUrlMatchExcludelist('https://amplitude.com/market', ['https://amplitude.com/blog']);
    expect(result).toEqual(false);
  });

  test('should return true when url regex is in the exclude list', () => {
    let result = isUrlMatchExcludelist(url, [new RegExp('https://amplitude.com/')]);
    expect(result).toEqual(true);

    result = isUrlMatchExcludelist('https://amplitude.com/market', [new RegExp('https://amplitude.com/')]);
    expect(result).toEqual(true);
  });

  test('should return false when url is not in the exclude list at all', () => {
    const result = isUrlMatchExcludelist(url, ['https://test.com', new RegExp('https://test.com/')]);
    expect(result).toEqual(false);
  });

  test('should return true when url is matching an item in the exclude list with regex wildcard', () => {
    const result = isUrlMatchExcludelist(url, [new RegExp('http.?://amplitude.*'), new RegExp('http.?://test.*')]);
    expect(result).toEqual(true);
  });

  test('should return true when url matches a pattern object with exact string match', () => {
    const result = isUrlMatchExcludelist(url, [{ pattern: 'https://amplitude.com/blog' }]);
    expect(result).toEqual(true);
  });

  test('should return false when url does not match a pattern object with exact string match', () => {
    const result = isUrlMatchExcludelist('https://test.com', [{ pattern: 'https://amplitude.com/blog' }]);
    expect(result).toEqual(false);
  });

  test('should return true when url matches a pattern object with regex pattern', () => {
    const result = isUrlMatchExcludelist(url, [{ pattern: 'https://amplitude\\.com/.*' }]);
    expect(result).toEqual(true);
  });

  test('should return true when url matches a pattern object with wildcard regex', () => {
    const result = isUrlMatchExcludelist('https://amplitude.com/docs/api', [{ pattern: 'https://amplitude\\.com/.*' }]);
    expect(result).toEqual(true);
  });

  test('should return false when url does not match a pattern object with regex pattern', () => {
    const result = isUrlMatchExcludelist('https://other.com/page', [{ pattern: 'https://amplitude\\.com/.*' }]);
    expect(result).toEqual(false);
  });

  test('should handle invalid regex patterns in pattern objects gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
      // Mock implementation to suppress console output during test
    });

    const result = isUrlMatchExcludelist(url, [{ pattern: '[invalid-regex' }]);
    expect(result).toEqual(false);

    consoleSpy.mockRestore();
  });

  test('should return true for pattern object with domain wildcard', () => {
    const result = isUrlMatchExcludelist('https://subdomain.amplitude.com/page', [
      { pattern: 'https://.*\\.amplitude\\.com/.*' },
    ]);
    expect(result).toEqual(true);
  });

  test('should return true for pattern object with path wildcard', () => {
    const result = isUrlMatchExcludelist('https://amplitude.com/any/deep/path', [
      { pattern: 'https://amplitude\\.com/.*' },
    ]);
    expect(result).toEqual(true);
  });

  test('should handle multiple pattern objects in exclude list', () => {
    const excludeList = [{ pattern: 'https://amplitude\\.com/.*' }, { pattern: 'https://test\\.com/.*' }];

    expect(isUrlMatchExcludelist('https://amplitude.com/blog', excludeList)).toEqual(true);
    expect(isUrlMatchExcludelist('https://test.com/page', excludeList)).toEqual(true);
    expect(isUrlMatchExcludelist('https://other.com/page', excludeList)).toEqual(false);
  });

  test('should handle mixed exclude list with strings, regexes, and pattern objects', () => {
    const excludeList = [
      'https://test.com',
      new RegExp('https://example.*'),
      { pattern: 'https://amplitude.com/blog' },
    ];

    expect(isUrlMatchExcludelist('https://test.com', excludeList)).toEqual(true);
    expect(isUrlMatchExcludelist('https://example.com', excludeList)).toEqual(true);
    expect(isUrlMatchExcludelist('https://amplitude.com/blog', excludeList)).toEqual(true);
    expect(isUrlMatchExcludelist('https://other.com', excludeList)).toEqual(false);
  });
});
