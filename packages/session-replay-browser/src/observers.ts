import { getGlobalScope } from '@amplitude/analytics-client-common';

export interface NetworkRequestEvent {
  timestamp: number;
  type: 'fetch';
  method: string;
  url: string;
  status?: number;
  duration?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  error?: {
    name: string;
    message: string;
  };
}

export type NetworkEventCallback = (event: NetworkRequestEvent) => void;

export class NetworkObservers {
  private fetchObserver: (() => void) | null = null;
  private eventCallback?: NetworkEventCallback;

  start(eventCallback: NetworkEventCallback) {
    this.eventCallback = eventCallback;
    this.observeFetch();
  }

  stop() {
    this.fetchObserver?.();
    this.fetchObserver = null;
    this.eventCallback = undefined;
  }

  private observeFetch() {
    const globalScope = getGlobalScope();
    if (!globalScope) return;

    const originalFetch = globalScope.fetch;
    if (!originalFetch) return;

    globalScope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startTime = Date.now();
      const requestEvent: NetworkRequestEvent = {
        timestamp: startTime,
        type: 'fetch',
        method: init?.method || 'GET', // Fetch API defaulted to GET when no method is provided
        url: input.toString(),
        requestHeaders: init?.headers as Record<string, string>,
      };

      try {
        const response = await originalFetch(input, init);
        const endTime = Date.now();

        requestEvent.status = response.status;
        requestEvent.duration = endTime - startTime;

        // Convert Headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        requestEvent.responseHeaders = headers;

        this.eventCallback?.(requestEvent);
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

        this.eventCallback?.(requestEvent);
        throw error;
      }
    };

    this.fetchObserver = () => {
      globalScope.fetch = originalFetch;
    };
  }
}
