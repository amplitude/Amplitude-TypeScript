import {
  BaseTransport,
  compressToGzipArrayBuffer,
  getStringSizeInBytes,
  isCompressionStreamAvailable,
  MIN_GZIP_UPLOAD_BODY_SIZE_BYTES,
  Payload,
  Response,
  Transport,
} from '@amplitude/analytics-core';

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
      const shouldCompressBody =
        this.shouldCompressUploadBody &&
        getStringSizeInBytes(bodyString) >= MIN_GZIP_UPLOAD_BODY_SIZE_BYTES &&
        isCompressionStreamAvailable();

      const sendBody = (body: string | ArrayBuffer, contentEncoding?: string) => {
        if (contentEncoding) {
          xhr.setRequestHeader('Content-Encoding', contentEncoding);
        }
        for (const [key, value] of Object.entries(headers)) {
          xhr.setRequestHeader(key, value);
        }
        xhr.send(body);
      };

      if (shouldCompressBody) {
        compressToGzipArrayBuffer(bodyString)
          .then((body) => sendBody(body, 'gzip'))
          .catch(reject);
      } else {
        sendBody(bodyString);
      }
    });
  }
}
