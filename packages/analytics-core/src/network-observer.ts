import { getGlobalScope } from './';
import { UUID } from './utils/uuid';
import { ILogger } from '.';
import { NetworkRequestEvent, RequestWrapper, ResponseWrapper } from './network-request-event';
/**
 * Typeguard function checks if an input is a Request object.
 */
function isRequest(input: any): input is Request {
  return typeof input === 'object' && input !== null && 'url' in input && 'method' in input;
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

  /**
   * Constructs a NetworkRequestEvent object from the fetch input parameters
   * @param input - The input to the fetch call
   * @param init - The init to the fetch call
   * @param response - The response to the fetch call
   * @param typedError - The error to the fetch call
   * @param startTime - The start time of the fetch call
   * @param durationStart - The duration start time of the fetch call
   * @returns A NetworkRequestEvent object
   */
  private handleNetworkRequestEvent(
    input: RequestInfo | URL | undefined,
    init: RequestInit | undefined,
    response: Response | undefined,
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
    if (isRequest(input)) {
      url = input['url'];
      method = input['method'];
    } else {
      url = input?.toString?.();
    }
    method = init?.method || method;

    let status, responseWrapper, error;
    if (response) {
      status = response.status;
      responseWrapper = new ResponseWrapper(response);
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
      startTime,
      startTime,
      url,
      init !== undefined ? new RequestWrapper(init) : undefined,
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

  private observeFetch(originalFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    /* istanbul ignore next */
    if (!this.globalScope || !originalFetch) {
      return;
    }
    this.globalScope.fetch = async (input?: RequestInfo | URL, init?: RequestInit) => {
      let response, typedError, timestamps;
      try {
        timestamps = this.getTimestamps();
      } catch (error) {
        /* istanbul ignore next */
        this.logger?.debug('an unexpected error occurred while observing fetch', error);
      }

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
          this.handleNetworkRequestEvent(
            input,
            init,
            response,
            typedError,
            /* istanbul ignore next */
            timestamps?.startTime,
            /* istanbul ignore next */
            timestamps?.durationStart,
          );
        } catch (err) {
          // this catch shouldn't be reachable, but keep it here for safety
          // because we're overriding the fetch function
          /* istanbul ignore next */
          this.logger?.debug('an unexpected error occurred while observing fetch', err);
        }
      }
    };
  }
}

// singleton instance of NetworkObserver
export const networkObserver = new NetworkObserver();
