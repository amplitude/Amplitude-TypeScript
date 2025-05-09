import { getGlobalScope } from './global-scope';
import { UUID } from './utils/uuid';
import { ILogger } from '.';

export interface NetworkRequestEvent {
  type: string;
  method: string;
  url?: string;
  timestamp: number;
  status?: number;
  duration?: number;
  requestHeaders?: Record<string, string> | Headers;
  requestBody?: string | FormData | URLSearchParams | ReadableStream | null;
  responseHeaders?: Record<string, string> | Headers;
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
        callback.callback({...event});
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
        requestHeaders: init?.headers as Record<string, string> | Headers,
        requestBody: init?.body as string | FormData | URLSearchParams | ReadableStream | null,
      };

      // exlude ReadableStream in the request event. it is not serializable
      // and downstreem consumers should not have access to it because it's mutable
      if (requestEvent.requestBody instanceof ReadableStream) {
        delete requestEvent.requestBody;
      }

      try {
        const response = await originalFetch(input as RequestInfo | URL, init);

        requestEvent.status = response.status;
        requestEvent.duration = Math.floor(performance.now() - durationStart);
        requestEvent.startTime = startTime;
        requestEvent.endTime = Math.floor(startTime + requestEvent.duration);
        requestEvent.responseHeaders = response.headers;

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
