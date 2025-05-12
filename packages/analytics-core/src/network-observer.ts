import { getGlobalScope } from './';
import { UUID } from './utils/uuid';
import { ILogger } from '.';
import { NetworkRequestEvent, RequestWrapper, ResponseWrapper } from './network-request-event';

/**
 * Typeguard function checks if an input is a Request object.
 */
function isRequest(requestInfo: any): requestInfo is Request {
  return typeof requestInfo === 'object' && requestInfo !== null && 'url' in requestInfo && 'method' in requestInfo;
}

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
        callback.callback(event);
      } catch (err) {
        // if the callback throws an error, we should catch it
        // to avoid breaking the fetch promise chain
        /* istanbul ignore next */
        this.logger?.debug('an unexpected error occurred while triggering event callbacks', err);
      }
    });
  }

  private handleNetworkRequestEvent(
    requestInfo: RequestInfo | URL | undefined,
    requestWrapper: RequestWrapper | undefined,
    responseWrapper: ResponseWrapper | undefined,
    typedError: Error | undefined,
    startTime?: number,
    durationStart?: number,
  ) {
    /* istanbul ignore next */
    if (startTime === undefined || durationStart === undefined) {
      // if we reach this point, it means that the performance API is not supported
      // so we can't construct a NetworkRequestEvent
      return;
    }
    
    // parse the URL and Method
    let url: string | undefined;
    let method = 'GET';
    if (isRequest(requestInfo)) {
      url = requestInfo['url'];
      method = requestInfo['method'];
    } else {
      url = requestInfo?.toString?.();
    }
    method = requestWrapper?.method || method;

    let status, error;
    if (responseWrapper) {
      status = responseWrapper.status;
    }

    if (typedError) {
      error = {
        name: typedError.name || 'UnknownError',
        message: typedError.message || 'An unknown error occurred',
      };

      status = 0;
    }

    const duration = Math.floor(performance.now() - durationStart);
    const endTime = Math.floor(startTime + duration);

    const requestEvent = new NetworkRequestEvent(
      'fetch',
      method,
      startTime, // timestamp and startTime are aliases
      startTime,
      url,
      requestWrapper,
      status,
      duration,
      responseWrapper,
      error,
      endTime,
    );

    this.triggerEventCallbacks(requestEvent);
  }

  getTimestamps() {
    /* istanbul ignore next */
    return {
      startTime: Date.now?.(),
      durationStart: performance?.now?.(),
    };
  }

  private observeFetch(originalFetch: (requestInfo: RequestInfo | URL, requestInit?: RequestInit) => Promise<Response>) {
    /* istanbul ignore next */
    if (!this.globalScope || !originalFetch) {
      return;
    }
    /**
     * IMPORTANT: This overrides window.fetch in browsers.
     * You probably never need to make changes to this function.
     * If you do, please be careful to preserve the original functionality of fetch
     * and make sure another developer who is an expert reviews this change throughly
     */
    this.globalScope.fetch = async (requestInfo?: RequestInfo | URL, requestInit?: RequestInit) => {
      // 1: capture the start time and duration start time before the fetch call
      let timestamps;
      try {
        timestamps = this.getTimestamps();
      } catch (error) {
        /* istanbul ignore next */
        this.logger?.debug('an unexpected error occurred while retrieving timestamps', error);
      }

      // 2. make the call to the original fetch and preserve the response or error
      let originalResponse, originalError;
      try {
        originalResponse = await originalFetch(requestInfo as RequestInfo | URL, requestInit);
      } catch (err) {
        // Capture error information
        originalError = err;
      }

      // 3. call the handler after the fetch call is done
      try {
        this.handleNetworkRequestEvent(
          requestInfo,
          requestInit ? new RequestWrapper(requestInit) : undefined,
          originalResponse ? new ResponseWrapper(originalResponse) : undefined,
          originalError as Error,
          /* istanbul ignore next */
          timestamps?.startTime,
          /* istanbul ignore next */
          timestamps?.durationStart,
        );
      } catch (err) {
        // this catch shouldn't be reachable, but keep it here for safety
        // because we're overriding the fetch function and better to be safe than sorry
        /* istanbul ignore next */
        this.logger?.debug('an unexpected error occurred while handling fetch', err);
      }

      // 4. return the original response or throw the original error
      if (originalResponse) {
        // if the response is not undefined, return it
        return originalResponse;
      } else {
        throw originalError;
      }
    };
  }
}

// singleton instance of NetworkObserver
export const networkObserver = new NetworkObserver();
