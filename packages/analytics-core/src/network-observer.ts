import { getGlobalScope } from './';
import { UUID } from './utils/uuid';
import { ILogger } from '.';
import {
  IRequestWrapper,
  NetworkRequestEvent,
  RequestWrapperFetch,
  ResponseWrapperFetch,
  RequestWrapperXhr,
  ResponseWrapperXhr,
  IResponseWrapper,
  RequestInitSafe,
  XMLHttpRequestBodyInitSafe,
} from './network-request-event';

// object that is added to each XHR instance so
// that info can be set in xhr.open and retrieved in xhr.send
type AmplitudeAnalyticsEvent = {
  method: string;
  url: string | URL;
  startTime: number;
  durationStart: number;
  status?: number;
};

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

type RequestUrlAndMethod = {
  url: string | URL | undefined;
  method: string | undefined;
};

// A narrowed down [XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest) type
// that only includes the properties we need to access and adds the $$AmplitudeAnalyticsEvent property
// Use great care when modifying this type, make sure you only use read-only properties and only add
// what you need to access, nothing more.
type AmplitudeXMLHttpRequestSafe = {
  $$AmplitudeAnalyticsEvent: AmplitudeAnalyticsEvent;
  status: number;
  getAllResponseHeaders: typeof XMLHttpRequest.prototype.getAllResponseHeaders;
  getResponseHeader: typeof XMLHttpRequest.prototype.getResponseHeader;
  addEventListener: (type: 'loadend', listener: () => void) => void;
};

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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalXhrOpen = this.globalScope?.XMLHttpRequest?.prototype?.open;
      /* istanbul ignore next */
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalXhrSend = this.globalScope?.XMLHttpRequest?.prototype?.send;
      if (originalXhrOpen && originalXhrSend) {
        this.observeXhr(originalXhrOpen, originalXhrSend);
      }

      /* istanbul ignore next */
      const originalFetch = this.globalScope?.fetch;
      /* istanbul ignore next */
      if (originalFetch) {
        this.observeFetch(originalFetch);
      }

      /* istanbul ignore next */
      this.isObserving = true;
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
    requestType: 'fetch' | 'xhr',
    requestInfo: RequestInfo | URL | RequestUrlAndMethod | undefined,
    requestWrapper: IRequestWrapper | undefined,
    responseWrapper: IResponseWrapper | undefined,
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
      requestType,
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

  private getTimestamps() {
    /* istanbul ignore next */
    return {
      startTime: Date.now?.(),
      durationStart: performance?.now?.(),
    };
  }

  private observeFetch(
    originalFetch: (requestInfo: RequestInfo | URL, requestInit?: RequestInit) => Promise<Response>,
  ) {
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
          'fetch',
          requestInfo,
          requestInit ? new RequestWrapperFetch(requestInit as RequestInitSafe) : undefined,
          originalResponse ? new ResponseWrapperFetch(originalResponse) : undefined,
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

  private observeXhr(
    originalXhrOpen:
      | ((
          method: string,
          url: string | URL,
          async?: boolean,
          username?: string | null,
          password?: string | null,
        ) => void)
      | undefined,
    originalXhrSend: ((body?: Document | XMLHttpRequestBodyInit | null) => void) | undefined,
  ) {
    /* istanbul ignore next */
    if (!this.globalScope || !originalXhrOpen || !originalXhrSend) {
      return;
    }

    const xhrProto = this.globalScope.XMLHttpRequest.prototype;

    const networkObserverContext = this as NetworkObserver;

    /**
     * IMPORTANT: This overrides window.XMLHttpRequest.prototype.open
     * You probably never need to make changes to this function.
     * If you do, please be careful to preserve the original functionality of xhr.open
     * and make sure another developer who is an expert reviews this change throughly
     */
    xhrProto.open = function (...args: any[]) {
      const xhrSafe = this as unknown as AmplitudeXMLHttpRequestSafe;
      const [method, url] = args as [string, string | URL];
      try {
        /* istanbul ignore next */
        xhrSafe.$$AmplitudeAnalyticsEvent = {
          method,
          url: url?.toString?.(),
          ...networkObserverContext.getTimestamps(),
        } as AmplitudeAnalyticsEvent;
      } catch (err) {
        /* istanbul ignore next */
        networkObserverContext.logger?.debug('an unexpected error occurred while calling xhr open', err);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return originalXhrOpen.apply(xhrSafe, args as any);
    };

    /**
     * IMPORTANT: This overrides window.XMLHttpRequest.prototype.send
     * You probably never need to make changes to this function.
     * If you do, please be careful to preserve the original functionality of xhr.send
     * and make sure another developer who is an expert reviews this change throughly
     */
    // allow "any" type for args to reflect how it's used in the browser
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
    xhrProto.send = function (...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhrSafe = this as unknown as AmplitudeXMLHttpRequestSafe;
      const body = args[0] as XMLHttpRequestBodyInitSafe;
      const requestEvent = xhrSafe.$$AmplitudeAnalyticsEvent;

      xhrSafe.addEventListener('loadend', function () {
        try {
          const responseHeaders = xhrSafe.getAllResponseHeaders();
          const responseBodySize = xhrSafe.getResponseHeader('content-length');
          const responseWrapper = new ResponseWrapperXhr(
            xhrSafe.status,
            responseHeaders,
            /* istanbul ignore next */
            responseBodySize ? parseInt(responseBodySize, 10) : undefined,
          );
          const requestWrapper = new RequestWrapperXhr(body);
          requestEvent.status = xhrSafe.status;
          networkObserverContext.handleNetworkRequestEvent(
            'xhr',
            { url: requestEvent.url, method: requestEvent.method },
            requestWrapper,
            responseWrapper,
            undefined,
            requestEvent.startTime,
            requestEvent.durationStart,
          );
        } catch (err) {
          /* istanbul ignore next */
          networkObserverContext.logger?.debug('an unexpected error occurred while handling xhr send', err);
        }
      });
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
      return originalXhrSend.apply(xhrSafe, args as any);
    };
  }
}

// singleton instance of NetworkObserver
export const networkObserver = new NetworkObserver();
