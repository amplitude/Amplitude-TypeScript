/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { pack } from '@amplitude/rrweb-packer';

onmessage = (e) => {
  const { event, sessionId } = e.data;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const compressedEvent = JSON.stringify(pack(event));

  postMessage({ compressedEvent, sessionId });
};

// added for testing
export const compressionOnMessage = onmessage;
