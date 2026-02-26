import { gunzipSync } from 'zlib';
import type { Request } from '@playwright/test';

/**
 * Parse request body as JSON. Decompresses gzip when Content-Encoding: gzip is set.
 * Uses postDataBuffer() for gzip so we get raw bytes; uses postData() for plain JSON.
 */
export function parseRequestBody(request: Request): Record<string, unknown> | undefined {
  const contentEncoding = request.headers()['content-encoding'];

  if (contentEncoding === 'gzip') {
    const buffer = request.postDataBuffer();
    if (!buffer || buffer.length === 0) return undefined;
    const bodyStr = gunzipSync(buffer).toString('utf8');
    return JSON.parse(bodyStr) as Record<string, unknown>;
  }

  const postData = request.postData();
  if (!postData) return undefined;
  return JSON.parse(postData) as Record<string, unknown>;
}
