import { getGlobalScope } from './global-scope';
import { UUID } from './utils/uuid';

export interface NetworkRequestMethod {
  GET: 'GET';
  POST: 'POST';
  PUT: 'PUT';
  DELETE: 'DELETE';
  PATCH: 'PATCH';
  OPTIONS: 'OPTIONS';
  HEAD: 'HEAD';
}

export interface NetworkRequestEvent {
  timestamp: number;
  type: 'fetch';
  method: string;
  url: string;
  status?: number;
  duration?: number;
  requestBodySize?: number;
  requestHeaders?: Record<string, string>;
  responseBodySize?: number;
  responseHeaders?: Record<string, string>;
  error?: {
    name: string;
    message: string;
  };
  startTime?: number;
  endTime?: number; // TODO: check what timestamp being used?
  // TODO: add errorCode Question: what is error code?
}

// using this type instead of the DOM's ttp so that it's Node compatible
type FormDataEntryValueBrowser = string | Blob | null;
export interface FormDataBrowser {
  entries(): IterableIterator<[string, FormDataEntryValueBrowser]>;
}

export type FetchRequestBody = string | Blob | ArrayBuffer | FormDataBrowser | URLSearchParams | null | undefined;

export function getRequestBodyLength(body: FetchRequestBody | null | undefined): number | undefined {
  const global = getGlobalScope();
  /* istanbul ignore next */
  if (!global?.TextEncoder) {
    return;
  }
  const { TextEncoder } = global;

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
    // TODO: get consensus before deciding if we do this
    const formData = body as FormDataBrowser;
    let total = 0;
    for (const [key, value] of formData.entries()) {
      total += key.length;
      if (typeof value === 'string') {
        total += new TextEncoder().encode(value).length;
      } else if ((value as Blob).size) {
        // if we encounter a "File" type, we should not count it and just return undefined
        total += (value as Blob).size;
      }
    }
    return total;
  }
  // Stream or unknown
  return;
}

export type NetworkEventCallbackFn = (event: NetworkRequestEvent) => void;

export class NetworkEventCallback {
  constructor(public readonly callback: (event: NetworkRequestEvent) => void, public readonly id: string = UUID()) {}
}

export class NetworkObserver {
  private restoreNativeFetch: (() => void) | null = null;
  private eventCallbacks: Map<string, NetworkEventCallback> = new Map();
  private isObserving = false;

  constructor() {
    if (!NetworkObserver.isSupported()) {
      throw new Error('Fetch API is not supported in this environment.');
    }
  }

  static isSupported(): boolean {
    const globalScope = getGlobalScope();
    return !!globalScope && !!globalScope.fetch;
  }

  subscribe(eventCallback: NetworkEventCallback) {
    this.eventCallbacks.set(eventCallback.id, eventCallback);
    if (!this.isObserving) {
      this.observeFetch();
      this.isObserving = true;
    }
  }

  unsubscribe(eventCallback: NetworkEventCallback) {
    this.eventCallbacks.delete(eventCallback.id);
    if (this.eventCallbacks.size === 0 && this.isObserving) {
      this.restoreNativeFetch?.();
      this.isObserving = false;
    }
  }

  protected triggerEventCallbacks(event: NetworkRequestEvent) {
    this.eventCallbacks.forEach((callback) => {
      callback.callback(event);
    });
  }

  private observeFetch() {
    const globalScope = getGlobalScope();
    if (!globalScope) return;

    const originalFetch = globalScope.fetch;

    globalScope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startTime = Date.now();
      const requestEvent: NetworkRequestEvent = {
        timestamp: startTime,
        type: 'fetch',
        method: init?.method || 'GET', // Fetch API defaults to GET when no method is provided
        url: input.toString(),
        requestHeaders: init?.headers as Record<string, string>,
        requestBodySize: getRequestBodyLength(init?.body as FetchRequestBody),
      };

      try {
        const response = await originalFetch(input, init);
        const endTime = Date.now();

        requestEvent.status = response.status;
        requestEvent.duration = endTime - startTime;
        requestEvent.startTime = startTime;
        requestEvent.endTime = endTime;

        // Convert Headers
        const headers: Record<string, string> = {};
        let contentLength: number | undefined = undefined;
        response.headers.forEach((value: string, key: string) => {
          headers[key] = value;
          if (key === 'content-length') {
            contentLength = parseInt(value, 10) || undefined;
          }
        });
        requestEvent.responseHeaders = headers;
        requestEvent.responseBodySize = contentLength;

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

        this.triggerEventCallbacks(requestEvent);
        throw error;
      }
    };

    this.restoreNativeFetch = () => {
      globalScope.fetch = originalFetch;
    };
  }
}
