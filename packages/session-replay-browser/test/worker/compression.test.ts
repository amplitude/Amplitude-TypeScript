import { deflateSync, inflateSync } from 'node:zlib';
import { eventWithTime } from '@amplitude/rrweb-types';
import { RRWEB_PACK_MARKER } from '../../src/utils/replay-event-encoding';
import { compressionOnMessage } from '../../src/worker/compression';

const runCompressionWorker = async (data: unknown) => {
  await (compressionOnMessage as (event: { data: unknown }) => Promise<void>)({ data });
};

describe('compression', () => {
  test('should serialize event with type and timestamp first when compression disabled', async () => {
    global.postMessage = jest.fn();

    const testEvent: eventWithTime = {
      timestamp: 1,
      type: 4,
      data: {
        height: 1,
        width: 1,
        href: 'http://localhost',
      },
    };

    await runCompressionWorker({
      event: testEvent,
      sessionId: 1234,
      gzipReplayEvents: false,
    });

    const expected = JSON.stringify({ type: testEvent.type, timestamp: testEvent.timestamp, data: testEvent.data });
    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 1234,
      compressedEvent: expected,
    });
  });

  test('should zlib-wrap event when gzipReplayEvents is true', async () => {
    global.postMessage = jest.fn();

    const testEvent: eventWithTime = {
      timestamp: 1,
      type: 4,
      data: { height: 1, width: 1, href: 'http://localhost' },
    };
    const innerJson = JSON.stringify({
      type: testEvent.type,
      timestamp: testEvent.timestamp,
      data: testEvent.data,
      v: RRWEB_PACK_MARKER,
    });
    const zlibBytes = deflateSync(Buffer.from(innerJson, 'utf-8'));

    class MockCompressionStream {
      writable = {
        getWriter: () => ({
          write: jest.fn(),
          close: jest.fn().mockResolvedValue(undefined),
        }),
      };
      readable = {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(zlibBytes) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      };
    }
    (global as unknown as { CompressionStream: typeof MockCompressionStream }).CompressionStream =
      MockCompressionStream;

    await runCompressionWorker({
      event: testEvent,
      sessionId: 99,
      gzipReplayEvents: true,
    });

    const posted = (global.postMessage as jest.Mock).mock.calls[0][0] as { compressedEvent: string };
    const latin1 = JSON.parse(posted.compressedEvent) as string;
    const unpacked = JSON.parse(inflateSync(Buffer.from(latin1, 'latin1')).toString('utf-8')) as { v: string };
    expect(unpacked.v).toBe(RRWEB_PACK_MARKER);

    delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
  });
});
