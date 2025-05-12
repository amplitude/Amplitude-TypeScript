import { getGlobalScope } from './global-scope';

// adding types to make this compile in NodeJS
type FormDataEntryValueBrowser = string | Blob | null;
export interface FormDataBrowser {
  entries(): IterableIterator<[string, FormDataEntryValueBrowser]>;
}

export type FetchRequestBody =
  | string
  | Blob
  | ReadableStream
  | ArrayBuffer
  | FormDataBrowser
  | URLSearchParams
  | Document
  | ArrayBufferView
  | null
  | undefined;

export interface IRequestWrapper {
  headers?: Record<string, string>;
  bodySize?: number;
  method?: string;
  body?: FetchRequestBody | Document | XMLHttpRequestBodyInit | null;
}

export const MAXIMUM_ENTRIES = 100;

/**
 * This class encapsulates the Request object so that the consumer can
 * only get access to the headers, method and body size.
 *
 * This is to prevent consumers from directly accessing the Request object
 * and mutating it or running costly operations on it.
 *
 * IMPORTANT: Do not make changes to this class without careful consideration
 * of performance implications, memory usage and potential to mutate the customer's
 * request.
 */
export class RequestWrapper implements IRequestWrapper {
  private _headers: Record<string, string> | undefined;
  private _bodySize: number | undefined;
  constructor(private request: RequestInit) {}

  get headers(): Record<string, string> {
    if (this._headers) return this._headers;

    if (Array.isArray(this.request.headers)) {
      this._headers = this.request.headers.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      return this._headers;
    }

    if (!(this.request.headers instanceof Headers)) {
      this._headers = { ...this.request.headers } as Record<string, string>;
      return this._headers;
    }

    const headers: Record<string, string> = {};
    this.request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    this._headers = headers;
    return headers;
  }

  get bodySize(): number | undefined {
    if (typeof this._bodySize === 'number') return this._bodySize;
    const global = getGlobalScope();

    /* istanbul ignore if */
    if (!global?.TextEncoder) {
      return;
    }
    const body = this.request.body as FetchRequestBody;
    this._bodySize = getBodySize(body, MAXIMUM_ENTRIES);
    return this._bodySize;
  }

  get method(): string | undefined {
    return this.request.method;
  }
}

export class RequestWrapperXhr implements IRequestWrapper {
  constructor(readonly body: Document | XMLHttpRequestBodyInit | null) {}

  get bodySize(): number | undefined {
    return getBodySize((this.body as FetchRequestBody), MAXIMUM_ENTRIES);
  }
}

function getBodySize(body: FetchRequestBody, maxEntries: number): number | undefined {
  let bodySize: number | undefined;
  const global = getGlobalScope();
  const TextEncoder = global?.TextEncoder;
  if (!TextEncoder) {
    return;
  }
  if (typeof body === 'string') {
    bodySize = new TextEncoder().encode(body).length;
  } else if (body instanceof Blob) {
    bodySize = body.size;
  } else if (body instanceof URLSearchParams) {
    bodySize = new TextEncoder().encode(body.toString()).length;
  } else if (ArrayBuffer.isView(body)) {
    bodySize = body.byteLength;
  } else if (body instanceof ArrayBuffer) {
    bodySize = body.byteLength;
  } else if (body instanceof FormData) {
    // Estimating only for text parts; not accurate for files
    const formData = body as FormDataBrowser;

    let total = 0;
    let count = 0;
    for (const [key, value] of formData.entries()) {
      total += key.length;
      if (typeof value === 'string') {
        total += new TextEncoder().encode(value).length;
      } else if (value instanceof Blob) {
        total += value.size;
      } else {
        // encountered another unknown type
        // we can't estimate the size of this entry
        return;
      }
      // terminate if we reach the maximum number of entries
      // to avoid performance issues in case of very large FormData
      if (++count >= maxEntries) {
        return;
      }
    }
    // TODO: handle the other XHR specific types
    bodySize = total;
  }

  return bodySize;
}

type ResponseXhr = {
  status: number;
  headers: string;
  size?: number;
}

/**
 * This class encapsulates the Response object so that the consumer can
 * only get access to the headers and body size.
 *
 * This is to prevent consumers from directly accessing the Response object
 * and mutating it or running costly operations on it.
 *
 * IMPORTANT:
 *   * Do not make changes to this class without careful consideration
 *     of performance implications, memory usage and potential to mutate the customer's
 *     response.
 *   * NEVER .clone the response object. This 2x's the memory overhead of the response
 *   * NEVER consume the body's stream. This will cause the response to be consumed
 *     meaning the body will be empty when the customer tries to access it.
 */
export class ResponseWrapper {
  private _headers: Record<string, string> | undefined;
  private _bodySize: number | undefined;
  constructor(private response: Response | ResponseXhr) {}

  get headers(): Record<string, string> | undefined {
    if (this._headers) return this._headers;
    const headers: Record<string, string> = {};

    if (this.response.headers instanceof Headers) {
      this.response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      this._headers = headers;
      return headers;
    } else if (typeof this.response.headers === 'string') {
      // TODO: parse the headers string
      return {};
    }

    return;
  }

  get bodySize(): number | undefined {
    if (this._bodySize !== undefined) return this._bodySize;
    if (!(this.response instanceof Response)) {
      return this.response.size;
    }
    const contentLength = this.response.headers.get('content-length');
    const bodySize = contentLength ? parseInt(contentLength, 10) : undefined;
    this._bodySize = bodySize;
    return bodySize;
  }

  get status(): number {
    return this.response.status;
  }
}

export class NetworkRequestEvent {
  constructor(
    private readonly type: string,
    private readonly method: string,
    private readonly timestamp: number,
    private readonly startTime: number,
    private readonly url?: string,
    private readonly requestWrapper?: IRequestWrapper,
    private readonly status?: number,
    private readonly duration?: number,
    private readonly responseWrapper?: ResponseWrapper,
    private readonly error?: {
      name: string;
      message: string;
    },
    private readonly endTime?: number,
    private readonly bodySize? : number,
  ) {}

  toSerializable(): Record<string, any> {
    const serialized: Record<string, any> = {
      type: this.type,
      method: this.method,
      url: this.url,
      timestamp: this.timestamp,
      status: this.status,
      duration: this.duration,
      error: this.error,
      startTime: this.startTime,
      endTime: this.endTime,
      requestHeaders: this.requestWrapper?.headers,
      requestBodySize: this.requestWrapper?.bodySize,
      responseHeaders: this.responseWrapper?.headers,
      responseBodySize: this.bodySize !== undefined ? this.bodySize : this.responseWrapper?.bodySize,
    };

    return Object.fromEntries(Object.entries(serialized).filter(([_, v]) => v !== undefined));
  }
}
