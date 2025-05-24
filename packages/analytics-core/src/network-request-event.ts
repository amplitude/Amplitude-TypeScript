import { getGlobalScope } from './global-scope';

/* SAFE TYPE DEFINITIONS
  These type definitions expose limited properties of the original types
  to prevent the consumer from mutating them or consuming them.
*/
type BlobSafe = {
  size: number;
};

type ArrayBufferSafe = {
  byteLength: number;
};

type ArrayBufferViewSafe = {
  byteLength: number;
};

type URLSearchParamsSafe = {
  toString(): string;
};

// no method on readablestream is safe to call
type ReadableStreamSafe = Record<string, never>;

type FormDataEntryValueSafe = string | BlobSafe | null;

type BodyInitSafe =
  | string
  | Blob
  | ArrayBufferSafe
  | FormDataSafe
  | URLSearchParamsSafe
  | ArrayBufferViewSafe
  | null
  | undefined;

type HeadersRequestSafe = {
  entries(): IterableIterator<[string, string]>;
  forEach(callbackfn: (value: string, key: string) => void): void;
};

type HeadersResponseSafe = {
  get(name: string): string | null;
  forEach(callbackfn: (value: string, key: string) => void): void;
};

type HeadersInitSafe = HeadersRequestSafe | Record<string, string> | string[][];

type ResponseSafe = {
  status: number;
  headers: HeadersResponseSafe | undefined;
};

export type RequestInitSafe = {
  method?: string;
  headers?: HeadersInitSafe;
  body?: BodyInitSafe;
};
export interface FormDataSafe {
  entries(): IterableIterator<[string, FormDataEntryValueSafe]>;
}
export type XMLHttpRequestBodyInitSafe = BlobSafe | FormDataSafe | URLSearchParamsSafe | string;

export type FetchRequestBody =
  | string
  | BlobSafe
  | ArrayBufferSafe
  | FormDataSafe
  | URLSearchParamsSafe
  | ArrayBufferViewSafe
  | null
  | undefined;

export interface IRequestWrapper {
  headers?: Record<string, string>;
  bodySize?: number;
  method?: string;
  body?: FetchRequestBody | XMLHttpRequestBodyInitSafe | null;
}

export const MAXIMUM_ENTRIES = 100;

/**
 * This class encapsulates the RequestInit (https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
 * object so that the consumer can only get access to the headers, method and body size.
 *
 * This is to prevent consumers from directly accessing the Request object
 * and mutating it or running costly operations on it.
 *
 * IMPORTANT:
 *    * Do not make changes to this class without careful consideration
 *      of performance implications, memory usage and potential to mutate the customer's
 *      request.
 *   * NEVER .clone() the RequestInit object. This will 2x's the memory overhead of the request
 *   * NEVER: call .arrayBuffer(), text(), json() or any other method on the body that
 *     consumes the body's stream. This will cause the response to be consumed
 *     meaning the body will be empty when the customer tries to access it.
 *     (ie: if the body is an instanceof https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
 *      never call any of the methods on it)
 */
export class RequestWrapperFetch implements IRequestWrapper {
  private _headers: Record<string, string> | undefined;
  private _bodySize: number | undefined;
  constructor(private request: RequestInitSafe) {}

  get headers(): Record<string, string> | undefined {
    if (this._headers) return this._headers;

    const headersUnsafe = this.request.headers;
    if (Array.isArray(headersUnsafe)) {
      const headers = headersUnsafe;
      this._headers = headers.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
    } else if (headersUnsafe instanceof Headers) {
      const headersSafe = headersUnsafe as HeadersRequestSafe;
      const headersObj: Record<string, string> = {};
      headersSafe.forEach((value, key) => {
        headersObj[key] = value;
      });
      this._headers = headersObj;
    } else if (typeof headersUnsafe === 'object') {
      this._headers = headersUnsafe as Record<string, string>;
    }

    return this._headers;
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
  constructor(readonly body: XMLHttpRequestBodyInitSafe | null) {}

  get bodySize(): number | undefined {
    return getBodySize(this.body as FetchRequestBody, MAXIMUM_ENTRIES);
  }
}

function getBodySize(bodyUnsafe: FetchRequestBody, maxEntries: number): number | undefined {
  let bodySize: number | undefined;
  const global = getGlobalScope();
  /* istanbul ignore next */
  const TextEncoder = global?.TextEncoder;
  /* istanbul ignore next */
  if (!TextEncoder) {
    return;
  }
  let bodySafe;
  if (typeof bodyUnsafe === 'string') {
    bodySafe = bodyUnsafe;
    bodySize = new TextEncoder().encode(bodySafe).length;
  } else if (bodyUnsafe instanceof Blob) {
    bodySafe = bodyUnsafe as BlobSafe;
    bodySize = bodySafe.size;
  } else if (bodyUnsafe instanceof URLSearchParams) {
    bodySafe = bodyUnsafe as URLSearchParamsSafe;
    bodySize = new TextEncoder().encode(bodySafe.toString()).length;
  } else if (ArrayBuffer.isView(bodyUnsafe)) {
    bodySafe = bodyUnsafe as ArrayBufferViewSafe;
    bodySize = bodySafe.byteLength;
  } else if (bodyUnsafe instanceof ArrayBuffer) {
    bodySafe = bodyUnsafe as ArrayBufferSafe;
    bodySize = bodySafe.byteLength;
  } else if (bodyUnsafe instanceof FormData) {
    // Estimating only for text parts; not accurate for files
    const formData = bodyUnsafe as unknown as FormDataSafe;

    let total = 0;
    let count = 0;
    for (const [key, value] of formData.entries()) {
      total += key.length;
      if (typeof value === 'string') {
        total += new TextEncoder().encode(value).length;
      } else if (value instanceof Blob) {
        total += value.size;
      } else {
        // encountered an unknown type
        // we can't estimate the size of this entry
        return;
      }
      // terminate if we reach the maximum number of entries
      // to avoid performance issues in case of very large FormData
      if (++count >= maxEntries) {
        return;
      }
    }
    bodySize = total;
  } else if (bodyUnsafe instanceof ReadableStream) {
    // If bodyUnsafe is an instanceof ReadableStream, we can't determine the size,
    // without consuming it, so we return undefined.
    // Never ever consume ReadableStream! DO NOT DO IT!!!
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bodySafe = bodyUnsafe as unknown as ReadableStreamSafe;
    return;
  }
  return bodySize;
}

export interface IResponseWrapper {
  headers?: Record<string, string>;
  bodySize?: number;
  status?: number;
  body?: string | Blob | ReadableStream | ArrayBuffer | FormDataSafe | URLSearchParams | ArrayBufferView | null;
}

/**
 * This class encapsulates the Fetch API Response object
 * (https://developer.mozilla.org/en-US/docs/Web/API/Response) so that the consumer can
 * only get access to the headers and body size.
 *
 * This is to prevent consumers from directly accessing the Response object
 * and mutating it or running costly operations on it.
 *
 * IMPORTANT:
 *   * Do not make changes to this class without careful consideration
 *     of performance implications, memory usage and potential to mutate the customer's
 *     response.
 *   * NEVER .clone() the Response object. This will 2x's the memory overhead of the response
 *   * NEVER consume the body's stream. This will cause the response to be consumed
 *     meaning the body will be empty when the customer tries to access it.
 *     (ie: if the body is an instanceof https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
 *      never call any of the methods on it)
 */
export class ResponseWrapperFetch implements IResponseWrapper {
  private _headers: Record<string, string> | undefined;
  private _bodySize: number | undefined;
  constructor(private response: ResponseSafe) {}

  get headers(): Record<string, string> | undefined {
    if (this._headers) return this._headers;

    if (this.response.headers instanceof Headers) {
      const headersSafe = this.response.headers as HeadersResponseSafe;
      const headersOut: Record<string, string> = {};
      /* istanbul ignore next */
      headersSafe?.forEach?.((value, key) => {
        headersOut[key] = value;
      });
      this._headers = headersOut;
      return headersOut;
    }

    return;
  }

  get bodySize(): number | undefined {
    if (this._bodySize !== undefined) return this._bodySize;
    /* istanbul ignore next */
    const contentLength = this.response.headers?.get?.('content-length');
    const bodySize = contentLength ? parseInt(contentLength, 10) : undefined;
    this._bodySize = bodySize;
    return bodySize;
  }

  get status(): number {
    return this.response.status;
  }
}

export class ResponseWrapperXhr implements IResponseWrapper {
  constructor(readonly statusCode: number, readonly headersString: string, readonly size: number | undefined) {}

  get bodySize(): number | undefined {
    return this.size;
  }

  get status(): number {
    return this.statusCode;
  }

  get headers(): Record<string, string> | undefined {
    if (!this.headersString) {
      return;
    }
    const headers: Record<string, string> = {};
    const headerLines = this.headersString.split('\r\n');
    for (const line of headerLines) {
      const [key, value] = line.split(': ');
      if (key && value) {
        headers[key] = value;
      }
    }
    return headers;
  }
}

export class NetworkRequestEvent {
  constructor(
    public readonly type: 'xhr' | 'fetch',
    public readonly method: string,
    public readonly timestamp: number,
    public readonly startTime: number,
    public readonly url?: string,
    public readonly requestWrapper?: IRequestWrapper,
    public readonly status: number = 0,
    public readonly duration?: number,
    public readonly responseWrapper?: IResponseWrapper,
    public readonly error?: {
      name: string;
      message: string;
    },
    public readonly endTime?: number,
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
      responseBodySize: this.responseWrapper?.bodySize,
    };

    return Object.fromEntries(Object.entries(serialized).filter(([_, v]) => v !== undefined));
  }
}
