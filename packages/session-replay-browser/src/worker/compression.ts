/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-restricted-globals */
import type { eventWithTime } from '@amplitude/rrweb-types';
import { encodeReplayEventForStorage } from '../utils/replay-event-encoding';

onmessage = async (e) => {
  const { event, sessionId, gzipReplayEvents } = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  const compressedEvent = await encodeReplayEventForStorage(event as eventWithTime, {
    compress: Boolean(gzipReplayEvents),
    scope: self,
  });
  postMessage({ compressedEvent, sessionId });
};

// added for testing
export const compressionOnMessage = onmessage;
