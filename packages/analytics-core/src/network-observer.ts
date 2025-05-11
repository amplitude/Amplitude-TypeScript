import { getGlobalScope } from './';
import { UUID } from './utils/uuid';
import { ILogger } from '.';

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
  | null
  | undefined;

/**
 * This class encapsulates the Request object so that the consumer can
 * only get access to the headers and body size.
 *
 * This is to prevent consumers from directly accessing the Request object
 * and mutating it or running costly operations on it.
 */
export class RequestWrapper {
  private MAXIMUM_ENTRIES = 100;
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
    const { TextEncoder } = global;
    const body = this.request.body as FetchRequestBody;

    let bodySize: number | undefined;
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
        }
        // terminate if we reach the maximum number of entries
        // to avoid performance issues in case of very large FormData
        if (++count >= this.MAXIMUM_ENTRIES) {
          this._bodySize = undefined;
          return;
        }
      }
      bodySize = total;
    }
    this._bodySize = bodySize;
    return bodySize;
  }
}

/**
 * This class encapsulates the Response object so that the consumer can
 * only get access to the headers and body size.
 *
 * This is to prevent consumers from directly accessing the Response object
 * and mutating it or running costly operations on it.
 */
export class ResponseWrapper {
  private _headers: Record<string, string> | undefined;
  private _bodySize: number | undefined;
  constructor(private response: Response) {}

  get headers(): Record<string, string> {
    if (this._headers) return this._headers;
    const headers: Record<string, string> = {};
    this.response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    this._headers = headers;
    return headers;
  }

  get bodySize(): number | undefined {
    if (this._bodySize !== undefined) return this._bodySize;
    const contentLength = this.response.headers.get('content-length');
    const bodySize = contentLength ? parseInt(contentLength, 10) : undefined;
    this._bodySize = bodySize;
    return bodySize;
  }
}

/**
 * This function checks if an input is a Request object.
 */
function isRequest(input: any): input is Request {
  return typeof input === 'object' && input !== null && 'url' in input && 'method' in input;
}

export interface NetworkRequestEvent {
  type: string;
  method: string;
  url?: string;
  timestamp: number;
  status?: number;
  duration?: number;
  requestWrapper?: RequestWrapper;
  responseWrapper?: ResponseWrapper;
  error?: {
    name: string;
    message: string;
  };
  startTime?: number;
  endTime?: number;
  toSerializable(): Record<string, any>;
}

export const serializeNetworkRequestEvent = (event: NetworkRequestEvent): Record<string, any> => {
  const serialized: Record<string, any> = {
    type: event.type,
    method: event.method,
    url: event.url,
    timestamp: event.timestamp,
    status: event.status,
    duration: event.duration,
    error: event.error,
    startTime: event.startTime,
    endTime: event.endTime,
    requestHeaders: event.requestWrapper?.headers,
    requestBodySize: event.requestWrapper?.bodySize,
    responseHeaders: event.responseWrapper?.headers,
    responseBodySize: event.responseWrapper?.bodySize,
  };

  return Object.fromEntries(Object.entries(serialized).filter(([_, v]) => v !== undefined));
};

export type NetworkEventCallbackFn = (event: NetworkRequestEvent) => void;

export class NetworkEventCallback {
  constructor(public readonly callback: (event: NetworkRequestEvent) => void, public readonly id: string = UUID()) {}
}

export class NetworkObserver {
  private eventCallbacks: Map<string, NetworkEventCallback> = new Map();
  // eslint-disable-next-line no-restricted-globals
  private globalScope?: typeof globalThis;
  private logger?: ILogger;
  private isObserving = false;
  constructor(logger?: ILogger) {
    this.logger = logger;
    const globalScope = getGlobalScope();
    if (!NetworkObserver.isSupported()) {
      /* istanbul ignore next */
      return;
    }
    this.globalScope = globalScope;
  }

  static isSupported(): boolean {
    const globalScope = getGlobalScope();
    return !!globalScope && !!globalScope.fetch;
  }

  subscribe(eventCallback: NetworkEventCallback, logger?: ILogger) {
    if (!this.logger) {
      this.logger = logger;
    }
    this.eventCallbacks.set(eventCallback.id, eventCallback);
    if (!this.isObserving) {
      /* istanbul ignore next */
      const originalFetch = this.globalScope?.fetch;
      /* istanbul ignore next */
      if (!originalFetch) {
        return;
      }
      /* istanbul ignore next */
      this.isObserving = true;
      this.observeFetch(originalFetch);
    }
  }

  unsubscribe(eventCallback: NetworkEventCallback) {
    this.eventCallbacks.delete(eventCallback.id);
  }

  protected triggerEventCallbacks(event: NetworkRequestEvent) {
    this.eventCallbacks.forEach((callback) => {
      try {
        const eventCopy = { ...event }; // defensive copy to avoid mutating the original event
        callback.callback(eventCopy);
      } catch (err) {
        // if the callback throws an error, we should catch it
        // to avoid breaking the fetch promise chain
        /* istanbul ignore next */
        this.logger?.debug('an unexpected error occurred while triggering event callbacks', err);
      }
    });
  }

  private constructNetworkRequestEvent(
    startTime: number,
    durationStart: number,
    input?: RequestInfo | URL,
    init?: RequestInit,
    response?: Response,
    error?: Error,
  ): NetworkRequestEvent {
    // parse the URL and Method
    let url: string | undefined;
    let method = 'GET';
    if (isRequest(input)) {
      url = input['url'];
      method = input['method'];
    } else {
      url = input?.toString?.();
    }
    method = init?.method || method;

    const requestEvent: NetworkRequestEvent = {
      timestamp: startTime,
      startTime,
      type: 'fetch',
      method,
      url,
      requestWrapper: init !== undefined ? new RequestWrapper(init) : undefined,
      toSerializable: () => serializeNetworkRequestEvent(requestEvent),
    };

    if (response) {
      requestEvent.status = response.status;
      requestEvent.responseWrapper = new ResponseWrapper(response);
    }

    if (error) {
      requestEvent.error = {
        name: error.name || 'UnknownError',
        message: error.message || 'An unknown error occurred',
      };
      if (error.name === 'AbortError') {
        requestEvent.status = 0;
      }
    }
    requestEvent.duration = Math.floor(performance.now() - durationStart);
    requestEvent.endTime = Math.floor(startTime + requestEvent.duration);
    return requestEvent;
  }

  private observeFetch(originalFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    /* istanbul ignore next */
    if (!this.globalScope || !originalFetch) {
      return;
    }
    this.globalScope.fetch = async (input?: RequestInfo | URL, init?: RequestInit) => {
      let response;
      let typedError;
      const startTime = Date.now();
      const durationStart = performance.now();

      // Adding "no-unsafe-finally" so that the return and throw statements from the original
      // fetch function are preserved. Never remove this!
      /*eslint no-unsafe-finally: "error"*/
      try {
        response = await originalFetch(input as RequestInfo | URL, init);
        return response;
      } catch (error) {
        // Capture error information
        typedError = error as Error;
        throw error;
      } finally {
        try {
          const requestEvent = this.constructNetworkRequestEvent(
            startTime,
            durationStart,
            input,
            init,
            response,
            typedError,
          );
          this.triggerEventCallbacks(requestEvent);
        } catch (err) {
          // this catch should never be reachable, but keep it here for safety
          // because we're overriding the fetch function and don't want an
          // exception inside finally to replace the original exception
          /* istanbul ignore next */
          this.logger?.debug('an unexpected error occurred while observing fetch', err);
        }
      }
    };
  }
}

// singleton instance of NetworkObserver
export const networkObserver = new NetworkObserver();
