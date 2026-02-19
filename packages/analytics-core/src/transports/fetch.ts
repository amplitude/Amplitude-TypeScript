import { BaseTransport } from './base';
import { Transport } from '../types/transport';
import { Payload } from '../types/payload';
import { Response } from '../types/response';
import { compressToGzipArrayBuffer, isCompressionStreamAvailable } from './gzip';

export class FetchTransport extends BaseTransport implements Transport {
  private customHeaders: Record<string, string>;
  private shouldCompressUploadBody: boolean;

  constructor(customHeaders: Record<string, string> = {}, shouldCompressUploadBody = false) {
    super();
    this.customHeaders = customHeaders;
    this.shouldCompressUploadBody = shouldCompressUploadBody;
  }

  async send(serverUrl: string, payload: Payload): Promise<Response | null> {
    /* istanbul ignore if */
    if (typeof fetch === 'undefined') {
      throw new Error('FetchTransport is not supported');
    }
    const bodyString = JSON.stringify(payload);
    let body: string | ArrayBuffer = bodyString;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: '*/*',
      ...this.customHeaders,
    };
    if (this.shouldCompressUploadBody && isCompressionStreamAvailable()) {
      body = await compressToGzipArrayBuffer(bodyString);
      headers['Content-Encoding'] = 'gzip';
    }
    const options: RequestInit = {
      headers,
      body,
      method: 'POST',
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
