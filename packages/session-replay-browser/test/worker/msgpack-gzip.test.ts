import { msgpackGzipOnMessage } from '../../src/worker/msgpack-gzip';

// Helper to call the exported onmessage handler as a plain function.
const call = (data: unknown) => (msgpackGzipOnMessage as unknown as (_: unknown) => Promise<void>)({ data });

describe('msgpack-gzip worker', () => {
  beforeEach(() => {
    global.postMessage = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns uncompressed when CompressionStream is unavailable', async () => {
    // CompressionStream is not defined in the Jest/Node environment.
    const encoded = new Uint8Array([0x81, 0x01]);
    await call({ id: 42, encoded });

    expect(global.postMessage).toHaveBeenCalledWith({ id: 42, compressed: encoded, didCompress: false }, [
      encoded.buffer,
    ]);
  });

  test('gzip-compresses and transfers buffer when CompressionStream is available', async () => {
    const fakeChunk = new Uint8Array([31, 139, 8, 0]); // gzip magic
    (global as any).CompressionStream = jest.fn().mockImplementation(() => ({
      writable: {
        getWriter: () => ({
          write: jest.fn().mockResolvedValue(undefined),
          close: jest.fn().mockResolvedValue(undefined),
        }),
      },
      readable: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: fakeChunk })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    }));

    try {
      const encoded = new Uint8Array([0x81, 0x01]);
      await call({ id: 7, encoded });

      expect(global.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, didCompress: true }),
        expect.any(Array),
      );
      const result = (global.postMessage as jest.Mock).mock.calls[0][0];
      expect(result.compressed).toEqual(fakeChunk);
    } finally {
      delete (global as any).CompressionStream;
    }
  });
});
