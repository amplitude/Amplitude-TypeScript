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
});
