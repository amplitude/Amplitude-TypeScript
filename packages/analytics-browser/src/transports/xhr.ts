import { BaseTransport, Payload, Response, Transport } from '@amplitude/analytics-core';

declare const CompressionStream:
  | {
      new (format: string): { readable: ReadableStream; writable: WritableStream };
    }
  | undefined;

// Compress string to gzip ArrayBuffer via CompressionStream.
// XHR accepts ArrayBuffer but not ReadableStream.
// Exported for testing.
export async function gzipToArrayBuffer(data: string): Promise<ArrayBuffer> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream is not available');
  }
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export class XHRTransport extends BaseTransport implements Transport {
  private state = {
    done: 4,
  };
  private customHeaders: Record<string, string>;
  private shouldCompressUploadBody: boolean;

  constructor(customHeaders: Record<string, string> = {}, shouldCompressUploadBody = false) {
    super();
    this.customHeaders = customHeaders;
    this.shouldCompressUploadBody = shouldCompressUploadBody;
  }

  async send(serverUrl: string, payload: Payload): Promise<Response | null> {
    return new Promise((resolve, reject) => {
      /* istanbul ignore if */
      if (typeof XMLHttpRequest === 'undefined') {
        reject(new Error('XHRTransport is not supported.'));
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', serverUrl, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === this.state.done) {
          const responseText = xhr.responseText;
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            resolve(this.buildResponse(JSON.parse(responseText)));
          } catch {
            resolve(this.buildResponse({ code: xhr.status }));
          }
        }
      };
      // Merge headers: custom headers override defaults (consistent with FetchTransport)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: '*/*',
        ...this.customHeaders,
      };

      const bodyString = JSON.stringify(payload);
      const sendBody = (body: string | ArrayBuffer, contentEncoding?: string) => {
        if (contentEncoding) {
          xhr.setRequestHeader('Content-Encoding', contentEncoding);
        }
        for (const [key, value] of Object.entries(headers)) {
          xhr.setRequestHeader(key, value);
        }
        xhr.send(body);
      };

      if (this.shouldCompressUploadBody && typeof CompressionStream !== 'undefined') {
        gzipToArrayBuffer(bodyString)
          .then((body) => sendBody(body, 'gzip'))
          .catch(reject);
      } else {
        sendBody(bodyString);
      }
    });
  }
}
