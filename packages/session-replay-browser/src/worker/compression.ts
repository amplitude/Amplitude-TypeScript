/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-restricted-globals */
import type { eventWithTime } from '@amplitude/rrweb-types';
import { encodeReplayEventForStorage } from '../utils/replay-event-encoding';

let encodeChain = Promise.resolve();

const appendToEncodeChain = (task: () => Promise<void>) => {
  encodeChain = encodeChain.then(task, task).catch(() => {
    // Keep the queue alive so one failed encode does not stall later jobs.
  });
};

const handleMessage = async (e: MessageEvent) => {
  const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  const { event, sessionId, gzipReplayEvents } = data as {
    event: eventWithTime;
    sessionId: string | number;
    gzipReplayEvents?: boolean;
  };
  const compressedEvent = await encodeReplayEventForStorage(event, {
    compress: Boolean(gzipReplayEvents),
    scope: self,
  });
  postMessage({ compressedEvent, sessionId });
};

onmessage = (e: MessageEvent) => {
  appendToEncodeChain(() => handleMessage(e));
};

// added for testing
export const compressionOnMessage = handleMessage;
export const postCompressionWorkerMessageForTests = (data: unknown) => {
  appendToEncodeChain(() => handleMessage({ data } as MessageEvent));
};
export const resetCompressionChainForTests = () => {
  encodeChain = Promise.resolve();
};
export const waitForCompressionChainForTests = () => encodeChain;
