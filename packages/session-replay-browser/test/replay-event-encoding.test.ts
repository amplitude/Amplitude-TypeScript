import { deflateSync, inflateSync } from 'node:zlib';
import { eventWithTime } from '@amplitude/rrweb-types';
import {
  RRWEB_PACK_MARKER,
  encodeReplayEventForStorage,
  serializeReplayEvent,
} from '../src/utils/replay-event-encoding';

describe('replay-event-encoding', () => {
  const mockEvent: eventWithTime = {
    type: 4,
    timestamp: 1,
    data: { height: 1, width: 1, href: 'http://localhost' },
  };

  test('serializeReplayEvent orders type and timestamp first', () => {
    expect(serializeReplayEvent(mockEvent)).toBe(
      JSON.stringify({ type: mockEvent.type, timestamp: mockEvent.timestamp, data: mockEvent.data }),
    );
  });

  test('encodeReplayEventForStorage returns plain JSON when compress is disabled', async () => {
    const encoded = await encodeReplayEventForStorage(mockEvent, { compress: false });
    expect(encoded).toBe(serializeReplayEvent(mockEvent));
  });

  test('encodeReplayEventForStorage matches unpack_events.js wire format', async () => {
    const json = JSON.stringify({
      type: mockEvent.type,
      timestamp: mockEvent.timestamp,
      data: mockEvent.data,
      v: RRWEB_PACK_MARKER,
    });
    const zlibBytes = deflateSync(Buffer.from(json, 'utf-8'));
    const mockWriter = { write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    const mockReader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(zlibBytes) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    class MockCompressionStream {
      constructor(format: string) {
        expect(format).toBe('deflate');
      }
      writable = { getWriter: () => mockWriter };
      readable = { getReader: () => mockReader };
    }

    const stored = await encodeReplayEventForStorage(mockEvent, {
      compress: true,
      scope: { CompressionStream: MockCompressionStream },
    });
    const latin1 = JSON.parse(stored) as string;
    const unpacked = JSON.parse(inflateSync(Buffer.from(latin1, 'latin1')).toString('utf-8')) as {
      v: string;
      type: number;
    };
    expect(unpacked.v).toBe(RRWEB_PACK_MARKER);
    expect(unpacked.type).toBe(mockEvent.type);
  });

  test('encodeReplayEventForStorage falls back without CompressionStream', async () => {
    const encoded = await encodeReplayEventForStorage(mockEvent, { compress: true, scope: {} });
    expect(encoded).toBe(serializeReplayEvent(mockEvent));
  });

  test('encodeReplayEventForStorage zlib path preserves delay field', async () => {
    const eventWithDelay = { ...mockEvent, delay: 25 } as eventWithTime & { delay: number };
    const json = JSON.stringify({
      type: eventWithDelay.type,
      timestamp: eventWithDelay.timestamp,
      delay: eventWithDelay.delay,
      data: eventWithDelay.data,
      v: RRWEB_PACK_MARKER,
    });
    const zlibBytes = deflateSync(Buffer.from(json, 'utf-8'));
    class MockCompressionStream {
      writable = { getWriter: () => ({ write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) }) };
      readable = {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(zlibBytes) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      };
    }
    const stored = await encodeReplayEventForStorage(eventWithDelay, {
      compress: true,
      scope: { CompressionStream: MockCompressionStream },
    });
    const unpacked = JSON.parse(inflateSync(Buffer.from(JSON.parse(stored) as string, 'latin1')).toString('utf-8')) as {
      delay: number;
    };
    expect(unpacked.delay).toBe(25);
  });

  test('encodeReplayEventForStorage falls back when deflate fails', async () => {
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
    const encoded = await encodeReplayEventForStorage(mockEvent, {
      compress: true,
      scope: { CompressionStream: FailingCompressionStream },
    });
    expect(encoded).toBe(serializeReplayEvent(mockEvent));
  });
});
