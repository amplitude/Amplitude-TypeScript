import { BaseTransport } from './base';
import { Transport } from '../types/transport';
import { Payload } from '../types/payload';
import { Response } from '../types/response';

// CompressionStream is a Web API not included in TypeScript's dom/es6 libs,
// so we declare it here to satisfy the type checker. | undefined reflects that
// it may be missing at runtime (e.g. older browsers); we guard with typeof check below.
declare const CompressionStream:
  | {
      new (format: string): { readable: ReadableStream; writable: WritableStream };
    }
  | undefined;

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
    let body: string | ReadableStream<Uint8Array> = bodyString;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: '*/*',
      ...this.customHeaders,
    };
    if (this.shouldCompressUploadBody && typeof CompressionStream !== 'undefined') {
      const stream = new Blob([bodyString]).stream().pipeThrough(new CompressionStream('gzip'));
      body = stream as ReadableStream<Uint8Array>;
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
