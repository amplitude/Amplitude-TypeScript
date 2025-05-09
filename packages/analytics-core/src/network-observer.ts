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
  responseHeaders?: Headers;
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

  constructor(logger?: ILogger) {
    const globalScope = getGlobalScope();
    if (!NetworkObserver.isSupported()) {
      /* istanbul ignore next */
      logger?.error('Fetch API is not supported in this environment.');
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

  subscribe(eventCallback: NetworkEventCallback) {
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
      /* eslint-disable no-empty */
      try {
        callback.callback(event);
      } catch (err) {}
      /* eslint-enable no-empty */
    });
  }

  private observeFetch() {
    /* istanbul ignore next */
    if (!this.globalScope || !this.originalFetch) {
      return;
    }
    const originalFetch = this.globalScope.fetch;

    // overwriting fetch to capture network events
    // using args with 'any' types because "fetch" is a JS function and the user
    // can pass in any type of data even if it's not of the proper type
    this.globalScope.fetch = async (...args: [input?: any, init?: any]) => {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      /* eslint-disable @typescript-eslint/no-unsafe-argument */
      /* eslint-disable @typescript-eslint/no-unsafe-member-access */
      /* eslint-disable @typescript-eslint/no-unsafe-call */
      const input = args[0];
      const init = args[1];
      const startTime = Date.now();
      const durationStart = performance.now();
      const requestInit = init as RequestInit;
      const requestEvent: NetworkRequestEvent = {
        timestamp: startTime,
        startTime,
        type: 'fetch',
        method: init?.method || 'GET', // Fetch API defaulted to GET when no method is provided
        url: input?.toString?.(),
        requestHeaders: requestInit?.headers as Record<string, string> | Headers,
        requestBody: requestInit?.body as string | FormData | URLSearchParams | ReadableStream | null,
      };

      try {
        const response = await originalFetch(...args);

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
          requestEvent.error.name = 'AbortError';
          requestEvent.status = 0;
        }

        this.triggerEventCallbacks(requestEvent);
        throw error;
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      /* eslint-disable @typescript-eslint/no-unsafe-argument */
      /* eslint-enable @typescript-eslint/no-unsafe-member-access */
      /* eslint-enable @typescript-eslint/no-unsafe-call */
    };
  }
}

// singleton instance of NetworkObserver
export const networkObserver = new NetworkObserver();
