/**
 * @jest-environment jsdom
 */

import { TextEncoder } from 'util';
import { compressToGzipArrayBuffer, isCompressionStreamAvailable } from '../../src/transports/gzip';

if (typeof global.TextEncoder === 'undefined') {
  (global as typeof globalThis & { TextEncoder?: typeof TextEncoder }).TextEncoder = TextEncoder;
}

describe('gzip', () => {
  describe('compressToGzipArrayBuffer', () => {
    test('returns undefined when CompressionStream is not available', async () => {
      const g = global as { CompressionStream?: unknown };
      const originalCompressionStream = g.CompressionStream;
      // Set to undefined (don't delete) so the code hits our return instead of ReferenceError
      g.CompressionStream = undefined;

      const result = await compressToGzipArrayBuffer('data');
      expect(result).toBeUndefined();

      g.CompressionStream = originalCompressionStream;
    });

    test('returns undefined when compression fails at runtime', async () => {
      const g = global as { CompressionStream?: unknown; Response?: unknown };
      const originalCompressionStream = g.CompressionStream;
      const originalResponse = g.Response;

      const mockCompressedStream = {};
      const pipeThrough = jest.fn().mockReturnValue(mockCompressedStream);
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => ({ pipeThrough }),
        configurable: true,
        writable: true,
      });

      g.CompressionStream = jest.fn();
      g.Response = jest.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.reject(new Error('compression failed')),
      }));

      const result = await compressToGzipArrayBuffer('data');
      expect(result).toBeUndefined();

      g.CompressionStream = originalCompressionStream;
      g.Response = originalResponse;
      delete (Blob.prototype as unknown as { stream?: () => unknown }).stream;
    });

    test('compresses with gzip and returns array buffer', async () => {
      const g = global as { CompressionStream?: unknown; Response?: unknown };
      const originalCompressionStream = g.CompressionStream;
      const originalResponse = g.Response;

      const mockCompressedStream = {};
      const pipeThrough = jest.fn().mockReturnValue(mockCompressedStream);
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => ({ pipeThrough }),
        configurable: true,
        writable: true,
      });

      const MockCompressionStream = jest.fn();
      g.CompressionStream = MockCompressionStream;

      const mockArrayBuffer = new Uint8Array([0x1f, 0x8b]).buffer;
      g.Response = jest.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      }));

      const result = await compressToGzipArrayBuffer('data');

      expect(MockCompressionStream).toHaveBeenCalledWith('gzip');
      expect(pipeThrough).toHaveBeenCalledWith(expect.anything());
      expect(g.Response as jest.Mock).toHaveBeenCalledWith(mockCompressedStream);
      expect(result).toBeDefined();
      expect(new Uint8Array(result as ArrayBuffer)).toEqual(new Uint8Array([0x1f, 0x8b]));

      g.CompressionStream = originalCompressionStream;
      g.Response = originalResponse;
      delete (Blob.prototype as unknown as { stream?: () => unknown }).stream;
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
