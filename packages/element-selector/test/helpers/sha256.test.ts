import { createHash } from 'crypto';
import { sha256Hex } from '../../src/helpers/sha256';

const nodeSha256 = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

describe('sha256Hex', () => {
  describe('canonical NIST / well-known vectors', () => {
    const vectors: Array<[string, string]> = [
      ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        'The quick brown fox jumps over the lazy dog',
        'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
      ],
      [
        'The quick brown fox jumps over the lazy dog.',
        'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c',
      ],
    ];

    it.each(vectors)('hashes %j correctly', (input, expected) => {
      expect(sha256Hex(input)).toBe(expected);
    });
  });

  it('always returns 64 lowercase hex characters', () => {
    for (const input of ['', 'a', 'hello', '🚀', 'x'.repeat(1000)]) {
      expect(sha256Hex(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  describe('matches Node crypto across edge cases', () => {
    const cases: Array<[string, string]> = [
      ['empty', ''],
      ['single ascii', 'a'],
      ['multi-byte utf-8 (2-byte)', 'café'],
      ['multi-byte utf-8 (3-byte)', '日本語テスト'],
      ['emoji / surrogate pair (4-byte)', '🚀☃️🎉'],
      ['lone high surrogate', '\ud83d'],
      ['lone low surrogate', '\udc00'],
      // Padding boundaries: messages of exactly 55, 56, 63, 64, 65 bytes exercise
      // the single- vs multi-block padding paths.
      ['55 bytes', 'x'.repeat(55)],
      ['56 bytes', 'x'.repeat(56)],
      ['63 bytes', 'x'.repeat(63)],
      ['64 bytes', 'x'.repeat(64)],
      ['65 bytes', 'x'.repeat(65)],
      ['long', 'lorem ipsum dolor sit amet '.repeat(100)],
    ];

    it.each(cases)('matches for %s', (_label, input) => {
      expect(sha256Hex(input)).toBe(nodeSha256(input));
    });
  });

  it('matches Node crypto for a randomized corpus including unicode', () => {
    for (let i = 0; i < 300; i++) {
      const input =
        Math.random().toString(36) +
        String.fromCharCode(0x2603, 0xd83d, 0xde00) +
        Math.random()
          .toString(36)
          .repeat((i % 9) + 1);
      expect(sha256Hex(input)).toBe(nodeSha256(input));
    }
  });
});
