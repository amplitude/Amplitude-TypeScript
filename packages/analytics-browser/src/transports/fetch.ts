import {
  BaseTransport,
  compressToGzipArrayBuffer,
  isCompressionStreamAvailable,
  MIN_GZIP_UPLOAD_BODY_SIZE_BYTES,
  Payload,
  Response,
  Transport,
} from '@amplitude/analytics-core';

// Conservative 1/4 of the shared 64 KiB keepalive budget. Why 16K: https://github.com/amplitude/Amplitude-TypeScript/pull/1781
export const KEEPALIVE_MAX_BODY_SIZE_BYTES = 16 * 1024;

// Temporary browser-specific fetch transport with gzip support.
// TODO: Merge this implementation back into @amplitude/analytics-core FetchTransport
// once React Native SDK supports request body gzip.
export class FetchTransport extends BaseTransport implements Transport {
  private customHeaders: Record<string, string>;
  private enableKeepalive: boolean;
  private referrerPolicy: ReferrerPolicy;

  constructor(customHeaders: Record<string, string> = {}, enableKeepalive?: boolean, referrerPolicy?: ReferrerPolicy) {
    super();
    this.customHeaders = customHeaders;
    // Enabled unless explicitly disabled.
    this.enableKeepalive = enableKeepalive !== false;
    // Enable when you have a security requirement to control the referrer information sent with the request. Otherwise, leave it as the default browser behavior.
    this.referrerPolicy = referrerPolicy || '';
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

    const bodySize = typeof body === 'string' ? body.length : body.byteLength;

    const options: RequestInit = {
      headers,
      body,
      method: 'POST',
      keepalive: this.enableKeepalive && bodySize <= KEEPALIVE_MAX_BODY_SIZE_BYTES,
      referrerPolicy: this.referrerPolicy,
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
