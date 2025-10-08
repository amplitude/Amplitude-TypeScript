import { eventWithTime } from '@amplitude/rrweb-types';
import { compressionOnMessage } from '../../src/worker/compression';
import { pack } from '@amplitude/rrweb-packer';

describe('compression', () => {
  test('should compress event', async () => {
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

    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 1234,
      compressedEvent: JSON.stringify(pack(testEvent)),
    });
  });

  test('should compress event from JSON string data when DataCloneError fallback is used', async () => {
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

    expect(global.postMessage).toHaveBeenCalledWith({
      sessionId: 5678,
      compressedEvent: JSON.stringify(pack(testEvent)),
    });
  });
});
