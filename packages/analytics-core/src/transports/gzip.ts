// CompressionStream is a Web API not included in TypeScript's dom/es6 libs.
declare const CompressionStream:
  | {
      new (format: string): { readable: ReadableStream; writable: WritableStream };
    }
  | undefined;

export const MIN_GZIP_UPLOAD_BODY_SIZE_BYTES = 2 * 1024 * 1024;

export const getStringSizeInBytes = (value: string): number => {
  return new TextEncoder().encode(value).byteLength;
};

/**
 * Returns true if CompressionStream is available (e.g. in supported browsers).
 */
export function isCompressionStreamAvailable(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/**
 * Compress a string to gzip and return the result as an ArrayBuffer.
 * Best-effort: returns undefined if CompressionStream is unavailable or compression fails.
 * Payload is small so buffering is fine. Used by Fetch and XHR transports.
 */
export async function compressToGzipArrayBuffer(data: string): Promise<ArrayBuffer | undefined> {
  const CompressionStreamImpl = CompressionStream;
  if (typeof CompressionStreamImpl === 'undefined') {
    return undefined;
  }
  try {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStreamImpl('gzip'));
    return await new Response(stream).arrayBuffer();
  } catch {
    return undefined;
  }
}
