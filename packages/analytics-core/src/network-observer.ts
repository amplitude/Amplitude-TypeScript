import { getGlobalScope } from './';
import { UUID } from './utils/uuid';
import { ILogger } from '.';

export interface FormDataBrowser {
  entries(): IterableIterator<[string, FormDataEntryValueBrowser]>;
}

export type FetchRequestBody = string | Blob | ArrayBuffer | FormDataBrowser | URLSearchParams | null | undefined;

// using this type instead of the DOM's ttp so that it's Node compatible
type FormDataEntryValueBrowser = string | Blob | null;

export class RequestWrapper {
  constructor(private request: RequestInit) {}
  private MAXIMUM_ENTRIES = 100;

  get headers(): Record<string, string> {
    if (!(this.request.headers instanceof Headers)) {
      return this.request.headers as Record<string, string>;
    }

    const headers: Record<string, string> = {};
    this.request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  get bodySize(): number | undefined {
    const global = getGlobalScope();

    /* istanbul ignore if */
    if (!global?.TextEncoder) {
      return;
    }
    const { TextEncoder } = global;
    const body = this.request.body as FetchRequestBody
  
    if (typeof body === 'string') {
      return new TextEncoder().encode(body).length;
    } else if (body instanceof Blob) {
      return body.size;
    } else if (body instanceof URLSearchParams) {
      return new TextEncoder().encode(body.toString()).length;
    } else if (body instanceof ArrayBuffer) {
      return body.byteLength;
    } else if (ArrayBuffer.isView(body)) {
      return body.byteLength;
    } else if (body instanceof FormData) {
      // Estimating only for text parts; not accurate for files
      const formData = body as FormDataBrowser;
  
      let total = 0;
      let count = 0;
      for (const [key, value] of formData.entries()) {
        total += key.length;
        if (typeof value === 'string') {
          total += new TextEncoder().encode(value).length;
        } else if ((value as Blob).size) {
          // if we encounter a "File" type, we should not count it and just return undefined
          total += (value as Blob).size;
        }
        // terminate if we reach the maximum number of entries
        // to avoid performance issues in case of very large FormDataß
        if (++count >= this.MAXIMUM_ENTRIES) {
          return;
        }
      }
      return total;
    }
    // unknown type
    return;
  }
}
export class ResponseWrapper {
  constructor(private response: Response) {}

  get headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    this.response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  get bodySize(): number | undefined {
    const contentLength = this.response.headers.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : undefined;
  }
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
}

export type NetworkEventCallbackFn = (event: NetworkRequestEvent) => void;

export class NetworkEventCallback {
  constructor(public readonly callback: (event: NetworkRequestEvent) => void, public readonly id: string = UUID()) {}
}

export class NetworkObserver {
  private originalFetch?: typeof fetch;
  private eventCallbacks: Map<string, NetworkEventCallback> = new Map();
  private isObserving = false;
  // eslint-disable-next-line no-restricted-globals
  private globalScope?: typeof globalThis;
  private logger?: ILogger;
  constructor(logger?: ILogger) {
    this.logger = logger;
    const globalScope = getGlobalScope();
    if (!NetworkObserver.isSupported()) {
      /* istanbul ignore next */
      return;
    }
    this.globalScope = globalScope;
    /* istanbul ignore next */
    this.originalFetch = this.globalScope?.fetch;
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
      this.observeFetch();
      this.isObserving = true;
    }
  }

  unsubscribe(eventCallback: NetworkEventCallback) {
    this.eventCallbacks.delete(eventCallback.id);
    if (this.originalFetch && this.globalScope && this.eventCallbacks.size === 0 && this.isObserving) {
      this.globalScope.fetch = this.originalFetch;
      this.isObserving = false;
    }
  }

  protected triggerEventCallbacks(event: NetworkRequestEvent) {
    this.eventCallbacks.forEach((callback) => {
      try {
        // if the callback throws an error, we should catch it
        // to avoid breaking the fetch promise chain
        callback.callback(event);
      } catch (err) {
        /* istanbul ignore next */
        this.logger?.debug('an unexpected error occurred while triggering event callbacks', err);
      }
    });
  }

  private observeFetch() {
    /* istanbul ignore next */
    if (!this.globalScope || !this.originalFetch) {
      return;
    }
    const originalFetch = this.globalScope.fetch;
    this.globalScope.fetch = async (input?: RequestInfo | URL, init?: RequestInit) => {
      const startTime = Date.now();
      const durationStart = performance.now();
      const requestEvent: NetworkRequestEvent = {
        timestamp: startTime,
        startTime,
        type: 'fetch',
        method: init?.method || 'GET', // Fetch API defaulted to GET when no method is provided
        url: input?.toString?.(),
        requestWrapper: init !== undefined ? new RequestWrapper(init) : undefined,
      };

      try {
        const response = await originalFetch(input as RequestInfo | URL, init);

        requestEvent.status = response.status;
        requestEvent.duration = Math.floor(performance.now() - durationStart);
        requestEvent.startTime = startTime;
        requestEvent.endTime = Math.floor(startTime + requestEvent.duration);
        requestEvent.responseWrapper = new ResponseWrapper(response);

        this.triggerEventCallbacks(requestEvent);
        return response;
      } catch (error) {
        const endTime = Date.now();
        requestEvent.duration = endTime - startTime;

        // Capture error information
        const typedError = error as Error;

        requestEvent.error = {
          name: typedError.name || 'UnknownError',
          message: typedError.message || 'An unknown error occurred',
        };

        if (typedError.name === 'AbortError') {
          requestEvent.status = 0;
        }

        this.triggerEventCallbacks(requestEvent);
        throw error;
      }
    };
  }
}

// singleton instance of NetworkObserver
export const networkObserver = new NetworkObserver();
