import { deflateSync, inflateSync } from 'node:zlib';
import { eventWithTime } from '@amplitude/rrweb-types';
import { RRWEB_PACK_MARKER } from '../../src/utils/replay-event-encoding';
import {
  compressionOnMessage,
  resetCompressionChainForTests,
  waitForCompressionChainForTests,
} from '../../src/worker/compression';

const runCompressionWorker = async (data: unknown) => {
  (compressionOnMessage as (event: { data: unknown }) => void)({ data });
  if (data && typeof data === 'object' && 'flush' in data) {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => {
    (compressionOnMessage as (event: { data: unknown }) => void)({ data: { flush: true } });
    setTimeout(resolve, 0);
  });
};

describe('compression', () => {
  beforeEach(() => {
    resetCompressionChainForTests();
  });

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

    const calls = (global.postMessage as jest.Mock).mock.calls.map(
      (c: [msg: { compressedEvent?: string; flushed?: boolean }]) => c[0],
    );
    const posted = calls.find((c) => c.compressedEvent != null);
    expect(posted?.compressedEvent).toBeDefined();
    const latin1 = JSON.parse(posted?.compressedEvent ?? '""') as string;
    const unpacked = JSON.parse(inflateSync(Buffer.from(latin1, 'latin1')).toString('utf-8')) as { v: string };
    expect(unpacked.v).toBe(RRWEB_PACK_MARKER);

    delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
  });

  test('accepts JSON string payloads from DataClone fallback', async () => {
    global.postMessage = jest.fn();
    const testEvent: eventWithTime = {
      timestamp: 2,
      type: 4,
      data: { height: 1, width: 1, href: 'http://localhost' },
    };
    await runCompressionWorker(
      JSON.stringify({
        event: testEvent,
        sessionId: 5,
        gzipReplayEvents: false,
      }),
    );
    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 5,
      compressedEvent: JSON.stringify({ type: 4, timestamp: 2, data: testEvent.data }),
    });
  });

  test('processes worker jobs in post order', async () => {
    const order: number[] = [];
    global.postMessage = jest.fn((msg: { compressedEvent: string; sessionId: number }) => {
      order.push(msg.sessionId);
    });

    class SlowCompressionStream {
      constructor() {
        (global as unknown as { __slowId?: number }).__slowId = 0;
      }
      writable = {
        getWriter: () => ({
          write: jest.fn().mockImplementation(async () => {
            const id = (global as unknown as { __slowId: number }).__slowId++;
            if (id === 0) {
              await new Promise((r) => setTimeout(r, 20));
            }
          }),
          close: jest.fn().mockResolvedValue(undefined),
        }),
      };
      readable = {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: deflateSync(Buffer.from('{"v":"v1","type":1}')) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      };
    }
    (global as unknown as { CompressionStream: typeof SlowCompressionStream }).CompressionStream =
      SlowCompressionStream;

    const event = { type: 4, timestamp: 1, data: {} } as eventWithTime;
    (compressionOnMessage as (e: { data: unknown }) => void)({
      data: { event, sessionId: 1, gzipReplayEvents: true },
    });
    (compressionOnMessage as (e: { data: unknown }) => void)({
      data: { event, sessionId: 2, gzipReplayEvents: true },
    });
    await waitForCompressionChainForTests();

    expect(order).toEqual([1, 2]);

    delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
  });
});
