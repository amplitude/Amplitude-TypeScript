import { eventWithTime } from '@amplitude/rrweb';
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

    compressionOnMessage({
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
});
