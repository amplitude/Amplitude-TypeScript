/**
 * @jest-environment jsdom
 */

import { compressToGzipArrayBuffer, isCompressionStreamAvailable } from '../../src/transports/gzip';

describe('gzip', () => {
  describe('compressToGzipArrayBuffer', () => {
    test('throws when CompressionStream is not available', async () => {
      const g = global as { CompressionStream?: unknown };
      const originalCompressionStream = g.CompressionStream;
      // Set to undefined (don't delete) so the code hits our throw instead of ReferenceError
      g.CompressionStream = undefined;

      await expect(compressToGzipArrayBuffer('data')).rejects.toThrow('CompressionStream is not available');

      g.CompressionStream = originalCompressionStream;
    });
  });

  describe('isCompressionStreamAvailable', () => {
    test('returns false when CompressionStream is undefined', () => {
      const g = global as { CompressionStream?: unknown };
      const originalCompressionStream = g.CompressionStream;
      delete g.CompressionStream;

      expect(isCompressionStreamAvailable()).toBe(false);

      g.CompressionStream = originalCompressionStream;
    });
  });
});
