import { truncateUtf8, utf8ByteLength, utf8ByteLengthIfOver, utf8ByteLengthOf } from '../../src/utils/utf8-byte-length';

describe('utf8ByteLength', () => {
  const samples = [
    '',
    'abc',
    'é',
    '€',
    '🎉',
    '\uD800',
    '\uDC00',
    '\uD800\uDC00',
    'a\uD800b',
    'a🎉b€é',
    'hello world',
    'é'.repeat(50) + '🎉' + '€'.repeat(10),
  ];

  test.each(samples)('matches TextEncoder for %j', (sample) => {
    expect(utf8ByteLength(sample)).toBe(new TextEncoder().encode(sample).byteLength);
    expect(utf8ByteLength(sample)).toBe(new Blob([sample]).size);
  });

  test('sums parts the same way Blob does', () => {
    const parts = ['a', 'é', '🎉', '\uD800'];
    expect(utf8ByteLengthOf(parts)).toBe(new Blob(parts).size);
  });

  test('utf8ByteLengthIfOver skips strings that cannot reach the cap', () => {
    expect(utf8ByteLengthIfOver('hello', 1000)).toBeUndefined();
    expect(utf8ByteLengthIfOver('abc', 3)).toBeUndefined();
    expect(utf8ByteLengthIfOver('é', 1)).toBe(2);
    expect(utf8ByteLengthIfOver('🎉', 3)).toBe(4);
  });
});

describe('truncateUtf8', () => {
  test('returns the original string when it already fits', () => {
    const value = 'hello';
    expect(truncateUtf8(value, 5)).toEqual({ value, truncated: false });
    expect(truncateUtf8('', 0)).toEqual({ value: '', truncated: false });
  });

  test('cuts ASCII on a byte boundary', () => {
    expect(truncateUtf8('hello world', 5)).toEqual({ value: 'hello', truncated: true });
  });

  test('keeps a 4-byte character that fits exactly', () => {
    expect(truncateUtf8('🎉hello', 4)).toEqual({ value: '🎉', truncated: true });
  });

  test('does not split a surrogate pair', () => {
    expect(truncateUtf8('a🎉', 4)).toEqual({ value: 'a', truncated: true });
  });

  test('drops a character that would exceed the remaining budget', () => {
    expect(truncateUtf8('ab€', 4)).toEqual({ value: 'ab', truncated: true });
    expect(truncateUtf8('aé', 1)).toEqual({ value: 'a', truncated: true });
  });

  test('treats an orphaned high surrogate as 3 bytes', () => {
    expect(truncateUtf8('\uD800x', 2)).toEqual({ value: '', truncated: true });
    expect(truncateUtf8('\uD800', 3)).toEqual({ value: '\uD800', truncated: false });
  });

  test('treats a negative budget as empty', () => {
    expect(truncateUtf8('ab', -1)).toEqual({ value: '', truncated: true });
  });

  test('returns an empty string when the budget is zero', () => {
    expect(truncateUtf8('a', 0)).toEqual({ value: '', truncated: true });
  });
});
