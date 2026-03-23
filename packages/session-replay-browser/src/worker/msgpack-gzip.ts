/**
 * Worker script: gzip-compresses a msgpack-encoded Uint8Array off the main thread.
 *
 * Protocol:
 *   IN  postMessage({ id: number, encoded: Uint8Array }, [encoded.buffer])
 *   OUT postMessage({ id: number, compressed: Uint8Array, didCompress: boolean }, [compressed.buffer])
 *
 * The caller transfers ownership of `encoded.buffer` for zero-copy passing;
 * the worker transfers ownership of `compressed.buffer` on the way back.
 */

// Override the Window postMessage signature with the DedicatedWorkerGlobalScope variant.
// Jest's coverage tool compiles this file against the Window lib, which doesn't include
// the (message, transfer[]) overload. The declaration below restores it for type-checking.
declare function postMessage(message: unknown, transfer: Transferable[]): void;

onmessage = async (e: MessageEvent<{ id: number; encoded: Uint8Array }>) => {
  const { id, encoded } = e.data;

  if (typeof CompressionStream === 'undefined') {
    // Fallback: send back uncompressed (caller will omit Content-Encoding header).
    postMessage({ id, compressed: encoded, didCompress: false }, [encoded.buffer]);
    return;
  }

  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  await writer.write(encoded as BufferSource);
  await writer.close();

  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((len, c) => len + c.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  postMessage({ id, compressed: out, didCompress: true }, [out.buffer]);
};

// Exported for unit testing only.
export const msgpackGzipOnMessage = onmessage;
