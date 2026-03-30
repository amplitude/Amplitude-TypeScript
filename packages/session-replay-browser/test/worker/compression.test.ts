import { eventWithTime } from '@amplitude/rrweb-types';
import { compressionOnMessage } from '../../src/worker/compression';

describe('compression', () => {
  test('should serialize event with type and timestamp first', async () => {
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

    // hack to make typescript not complain
    (compressionOnMessage as (_: unknown) => void)({
      data: {
        event: testEvent,
        sessionId: 1234,
      },
    });

    // Key ordering: type and timestamp must appear first
    const expected = JSON.stringify({ type: testEvent.type, timestamp: testEvent.timestamp, data: testEvent.data });
    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 1234,
      compressedEvent: expected,
    });
  });

  test('should include delay field when present', async () => {
    global.postMessage = jest.fn();

    const testEventWithDelay = {
      timestamp: 1,
      type: 3,
      delay: 50,
      data: { source: 0 },
    };

    (compressionOnMessage as (_: unknown) => void)({
      data: {
        event: testEventWithDelay,
        sessionId: 1234,
      },
    });

    const expected = JSON.stringify({
      type: testEventWithDelay.type,
      timestamp: testEventWithDelay.timestamp,
      delay: testEventWithDelay.delay,
      data: testEventWithDelay.data,
    });
    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 1234,
      compressedEvent: expected,
    });
  });

  test('should serialize event from JSON string data when DataCloneError fallback is used', async () => {
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

    // Simulate the actual behavior: JSON.stringify produces a primitive string
    const jsonData = JSON.stringify({
      event: testEvent,
      sessionId: 5678,
    });

    // Pass the primitive string as e.data (this is what actually happens with JSON.stringify fallback)
    (compressionOnMessage as (_: unknown) => void)({
      data: jsonData,
    });

    const expected = JSON.stringify({ type: testEvent.type, timestamp: testEvent.timestamp, data: testEvent.data });
    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 5678,
      compressedEvent: expected,
    });
  });
});
