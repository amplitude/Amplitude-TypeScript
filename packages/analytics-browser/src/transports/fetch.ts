import {
  BaseTransport,
  compressToGzipArrayBuffer,
  isCompressionStreamAvailable,
  MIN_GZIP_UPLOAD_BODY_SIZE_BYTES,
  Payload,
  Response,
  Transport,
} from '@amplitude/analytics-core';

// keepalive lets a request survive page navigation, but the browser caps the *combined*
// size of all in-flight keepalive requests in a document at 64 KiB and rejects anything
// over it (https://fetch.spec.whatwg.org/#http-network-or-cache-fetch). Since that budget
// is shared (e.g. with session-replay), we gate at half to leave headroom; larger bodies
// fall back to a plain fetch that won't survive navigation. The headroom also covers using
// the cheap string length as a rough byte estimate (like the gzip threshold below) instead
// of measuring exact UTF-8 bytes.
export const MAX_KEEPALIVE_BYTES = 32 * 1024;

// Temporary browser-specific fetch transport with gzip support.
// TODO: Merge this implementation back into @amplitude/analytics-core FetchTransport
// once React Native SDK supports request body gzip.
export class FetchTransport extends BaseTransport implements Transport {
  private customHeaders: Record<string, string>;

  constructor(customHeaders: Record<string, string> = {}) {
    super();
    this.customHeaders = customHeaders;
  }

  async send(serverUrl: string, payload: Payload, shouldCompressUploadBody = false): Promise<Response | null> {
    /* istanbul ignore if */
    if (typeof fetch === 'undefined') {
      throw new Error('FetchTransport is not supported');
    }

    const bodyString = JSON.stringify(payload);
    const shouldCompressBody =
      shouldCompressUploadBody &&
      bodyString.length >= MIN_GZIP_UPLOAD_BODY_SIZE_BYTES &&
      isCompressionStreamAvailable();

    let body: string | ArrayBuffer = bodyString;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: '*/*',
    };

    if (shouldCompressBody) {
      const compressed = await compressToGzipArrayBuffer(bodyString);
      if (compressed) {
        headers['Content-Encoding'] = 'gzip';
        body = compressed;
      }
    }
    headers = {
      ...this.customHeaders,
      ...headers,
    };

    // Use string length as a rough byte estimate (the compressed path already has an exact
    // byte count) to avoid allocating a Blob on every request.
    const bodySize = typeof body === 'string' ? body.length : body.byteLength;

    const options: RequestInit = {
      headers,
      body,
      method: 'POST',
      keepalive: bodySize <= MAX_KEEPALIVE_BYTES,
    };

    const response = await fetch(serverUrl, options);
    const responseText = await response.text();
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return this.buildResponse(JSON.parse(responseText));
    } catch {
      return this.buildResponse({ code: response.status });
    }
  }
}
