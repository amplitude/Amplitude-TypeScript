/**
 * Gzip-compresses a JSON string using the CompressionStream API.
 * The `scope` parameter must be the global object (window or self) that
 * owns the CompressionStream constructor. The caller is responsible for
 * verifying that CompressionStream exists on that scope before calling.
 * Returns null if compression fails for any reason.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gzipJson(jsonStr: string, scope: any): Promise<Uint8Array | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const CS = scope.CompressionStream as typeof CompressionStream;
    const stream = new CS('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Read concurrently with write+close. CompressionStream applies back-pressure:
    // close() blocks until all compressed output is consumed, so the reader must
    // run in parallel or close() will deadlock waiting for the readable side to drain.
    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const readPromise: Promise<void> = (async () => {
      for (;;) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { done, value } = await reader.read();
        if (done) break;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        chunks.push(value);
      }
    })();

    await writer.write(new TextEncoder().encode(jsonStr));
    await writer.close();
    await readPromise;

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch {
    return null;
  }
}
