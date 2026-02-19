// CompressionStream is a Web API not included in TypeScript's dom/es6 libs.
declare const CompressionStream:
  | {
      new (format: string): { readable: ReadableStream; writable: WritableStream };
    }
  | undefined;

/**
 * Returns true if CompressionStream is available (e.g. in supported browsers).
 */
export function isCompressionStreamAvailable(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/**
 * Compress a string to gzip and return the result as an ArrayBuffer.
 * Payload is small so buffering is fine. Used by Fetch and XHR transports.
 */
export async function compressToGzipArrayBuffer(data: string): Promise<ArrayBuffer> {
  const CompressionStreamImpl = CompressionStream;
  if (typeof CompressionStreamImpl === 'undefined') {
    throw new Error('CompressionStream is not available');
  }
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStreamImpl('gzip'));
  return new Response(stream).arrayBuffer();
}
