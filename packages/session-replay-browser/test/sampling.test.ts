import { xxHash32, isSessionInSample } from '../src/sampling';

describe('xxHash32', () => {
  test('should return consistent hash for empty string', () => {
    expect(xxHash32('')).toBe(46947589);
  });

  test('should return consistent hash for short string', () => {
    expect(xxHash32('abc')).toBe(852579327);
  });

  test('should return consistent hash for session id string', () => {
    expect(xxHash32('1719847315013')).toBe(36109684);
  });

  test('should return consistent hash with custom seed', () => {
    const hash0 = xxHash32('test', 0);
    const hash1 = xxHash32('test', 1);
    expect(hash0).not.toBe(hash1);
  });

  test('should handle strings longer than 16 bytes', () => {
    const hash = xxHash32('this is a longer string input');
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });

  test('should handle 2-byte UTF-8 characters', () => {
    // e.g. 'é' is U+00E9, encodes to 2 bytes in UTF-8
    const hash = xxHash32('café');
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  test('should handle 3-byte UTF-8 characters', () => {
    // e.g. '中' is U+4E2D, encodes to 3 bytes in UTF-8
    const hash = xxHash32('中文');
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  test('should handle 4-byte UTF-8 characters (surrogate pairs)', () => {
    // e.g. '😀' is U+1F600, encodes to 4 bytes in UTF-8 and is a surrogate pair in JS
    const hash = xxHash32('😀');
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

describe('isSessionInSample', () => {
  test('should return true when hash mod falls below sample rate', () => {
    // xxHash32('1719847315013') % 1_000_000 / 1_000_000 = 0.109684
    expect(isSessionInSample(1719847315013, 0.2)).toBe(true);
  });

  test('should return false when hash mod falls above sample rate', () => {
    expect(isSessionInSample(1719847315013, 0.1)).toBe(false);
  });

  test('should return true for sample rate of 1', () => {
    expect(isSessionInSample(1719847315013, 1)).toBe(true);
  });

  test('should return false for sample rate of 0', () => {
    expect(isSessionInSample(1719847315013, 0)).toBe(false);
  });

  test('should accept string session ids', () => {
    expect(isSessionInSample('1719847315013', 0.2)).toBe(true);
  });

  test('should be deterministic', () => {
    const result1 = isSessionInSample(1719847315013, 0.5);
    const result2 = isSessionInSample(1719847315013, 0.5);
    expect(result1).toBe(result2);
  });
});
