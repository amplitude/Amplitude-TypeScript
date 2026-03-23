/**
 * Worker script: gzip-compresses a msgpack-encoded Uint8Array off the main thread.
 *
 * Protocol:
 *   IN  postMessage({ id: number, encoded: Uint8Array }, [encoded.buffer])
 *   OUT postMessage({ id: number, compressed: Uint8Array, didCompress: boolean }, [compressed.buffer])
 *
 * The caller transfers ownership of `encoded.buffer` for zero-copy passing;
 * the worker transfers ownership of `compressed.buffer` on the way back.
 *
 * NOTE: This file intentionally contains no TypeScript-specific syntax (no type annotations,
 * no `as` casts, no `type` declarations). Multiple packages bundle this file via Rollup using
 * different TypeScript plugin configurations; keeping it as plain JavaScript ensures it can be
 * parsed by Rollup's acorn parser even when the TypeScript plugin is not active.
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-plus-operands */

onmessage = async (e) => {
  const { id, encoded } = e.data;

  if (typeof CompressionStream === 'undefined') {
    // Fallback: send back uncompressed (caller will omit Content-Encoding header).
    // @ts-expect-error — DedicatedWorkerGlobalScope.postMessage(msg, transfer[]) is not in Window lib
    postMessage({ id, compressed: encoded, didCompress: false }, [encoded.buffer]);
    return;
  }

  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  await writer.write(encoded);
  await writer.close();

  const chunks = [];
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

  // @ts-expect-error — DedicatedWorkerGlobalScope.postMessage(msg, transfer[]) is not in Window lib
  postMessage({ id, compressed: out, didCompress: true }, [out.buffer]);
};

// Exported for unit testing only.
export const msgpackGzipOnMessage = onmessage;
