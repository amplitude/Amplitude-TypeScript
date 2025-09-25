/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { pack } from '@amplitude/rrweb-packer';

onmessage = (e) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const { event, sessionId } = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const compressedEvent = JSON.stringify(pack(event));
  postMessage({ compressedEvent, sessionId });
};

// added for testing
export const compressionOnMessage = onmessage;
