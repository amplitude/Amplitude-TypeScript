/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-restricted-globals */
import type { eventWithTime } from '@amplitude/rrweb-types';
import { encodeReplayEventForStorage } from '../utils/replay-event-encoding';

let encodeChain: Promise<void> = Promise.resolve();

onmessage = (e) => {
  const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;

  if (data.flush) {
    encodeChain = encodeChain.then(() => {
      postMessage({ flushed: true });
    });
    return;
  }

  const { event, sessionId, gzipReplayEvents } = data;
  encodeChain = encodeChain.then(async () => {
    const compressedEvent = await encodeReplayEventForStorage(event as eventWithTime, {
      compress: Boolean(gzipReplayEvents),
      scope: self,
    });
    postMessage({ compressedEvent, sessionId });
  });
};

// added for testing
export const compressionOnMessage = onmessage;
export const resetCompressionChainForTests = () => {
  encodeChain = Promise.resolve();
};
