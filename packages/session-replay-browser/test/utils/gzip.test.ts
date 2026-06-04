import { compressUtf8Json, deflateJson, gzipJson } from '../../src/utils/gzip';

describe('gzip utils', () => {
  test('gzipJson uses gzip format', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let formatUsed = '';
    class MockCompressionStream {
      constructor(format: string) {
        formatUsed = format;
      }
      writable = { getWriter: () => ({ write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) }) };
      readable = {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: bytes })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      };
    }
    const scope = { CompressionStream: MockCompressionStream };
    const result = await gzipJson('{"a":1}', scope);
    expect(result).toEqual(bytes);
    expect(formatUsed).toBe('gzip');
  });

  test('deflateJson uses deflate format', async () => {
    const bytes = new Uint8Array([4, 5]);
    let formatUsed = '';
    class MockCompressionStream {
      constructor(format: string) {
        formatUsed = format;
      }
      writable = { getWriter: () => ({ write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) }) };
      readable = {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: bytes })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      };
    }
    const scope = { CompressionStream: MockCompressionStream };
    const result = await deflateJson('{"b":2}', scope);
    expect(result).toEqual(bytes);
    expect(formatUsed).toBe('deflate');
  });

  test('compressUtf8Json returns null when compression fails', async () => {
    class FailingCompressionStream {
      writable = {
        getWriter: () => ({
          write: jest.fn().mockRejectedValue(new Error('fail')),
          close: jest.fn(),
        }),
      };
      readable = {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      };
    }
    const result = await compressUtf8Json('{}', { CompressionStream: FailingCompressionStream }, 'gzip');
    expect(result).toBeNull();
  });
});
