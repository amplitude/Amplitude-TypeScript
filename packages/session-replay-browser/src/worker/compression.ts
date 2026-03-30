/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

onmessage = (e) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const { event, sessionId } = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  // Serialize with type+timestamp first for streaming parser compatibility.
  // JS engines serialize non-integer string keys in insertion order (ES2015 spec,
  // reliable across V8/SpiderMonkey/JSC), so explicit construction controls key order.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { type, timestamp, delay, data } = event;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const compressedEvent =
    delay != null ? JSON.stringify({ type, timestamp, delay, data }) : JSON.stringify({ type, timestamp, data });
  postMessage({ compressedEvent, sessionId });
};

// added for testing
export const compressionOnMessage = onmessage;
