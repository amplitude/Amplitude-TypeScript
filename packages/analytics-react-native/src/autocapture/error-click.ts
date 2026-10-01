import { getGlobalScope } from '@amplitude/analytics-core';

const ERROR_CLICK_TIMEOUT = 2_000;

export type ReactNativeErrorEvent = {
  kind: 'error' | 'unhandledrejection' | 'console';
  message?: string;
  filename?: string;
  lineNumber?: number;
  columnNumber?: number;
  stack?: string;
};

export type ErrorClickData = {
  error: ReactNativeErrorEvent;
  eventProperties: Record<string, any>;
};

export type ErrorClickEventProperties = {
  '[Amplitude] Kind': ReactNativeErrorEvent['kind'];
  '[Amplitude] Message'?: string;
  '[Amplitude] Stack'?: string;
  '[Amplitude] Filename'?: string;
  '[Amplitude] Line Number'?: number;
  '[Amplitude] Column Number'?: number;
};

type ErrorClickTracker = {
  registerClickEvent: (eventProperties: Record<string, any>) => (() => void) | undefined;
  registerErrorEvent: (error: ReactNativeErrorEvent) => void;
};

type ErrorUtilsGlobalHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler?: () => ErrorUtilsGlobalHandler | undefined;
  setGlobalHandler?: (handler: ErrorUtilsGlobalHandler) => void;
};

type ErrorObserver = {
  handler: (event: ReactNativeErrorEvent) => void;
};

type ErrorObserverState = {
  observers: Set<ErrorObserver>;
  previousHandler: ErrorUtilsGlobalHandler | undefined;
  dispatcher: ErrorUtilsGlobalHandler;
};

const errorObserverStates = new WeakMap<ErrorUtilsLike, ErrorObserverState>();

export function getErrorClickEventProperties(
  errorClickData: ErrorClickData,
): ErrorClickEventProperties & Record<string, any> {
  const { error, eventProperties } = errorClickData;
  const errorEventProperties: ErrorClickEventProperties = {
    '[Amplitude] Kind': error.kind,
    '[Amplitude] Message': error.message,
    '[Amplitude] Stack': error.stack,
    '[Amplitude] Filename': error.filename,
    '[Amplitude] Line Number': error.lineNumber,
    '[Amplitude] Column Number': error.columnNumber,
  };
  return {
    ...errorEventProperties,
    ...eventProperties,
  };
}

export function createErrorClickTracker(
  errorClickHandler: (errorClickData: ErrorClickData) => void,
): ErrorClickTracker {
  let errorClickTimer: ReturnType<typeof setTimeout> | undefined;
  let latestClickEventProperties: Record<string, any> | undefined;

  function clearClickTimer() {
    if (errorClickTimer) {
      clearTimeout(errorClickTimer);
      errorClickTimer = undefined;
    }
    latestClickEventProperties = undefined;
  }

  function registerClickEvent(eventProperties: Record<string, any>) {
    clearClickTimer();
    latestClickEventProperties = eventProperties;
    errorClickTimer = setTimeout(clearClickTimer, ERROR_CLICK_TIMEOUT);
    return clearClickTimer;
  }

  function registerErrorEvent(error: ReactNativeErrorEvent) {
    if (!latestClickEventProperties) {
      return;
    }
    errorClickHandler({
      error,
      eventProperties: latestClickEventProperties,
    });
    clearClickTimer();
  }

  return { registerClickEvent, registerErrorEvent };
}

const isDomException = (error: unknown): error is DOMException => {
  return typeof DOMException !== 'undefined' && error instanceof DOMException;
};

const errorToEvent = (error: unknown): ReactNativeErrorEvent => {
  if (error instanceof Error || isDomException(error)) {
    return {
      kind: 'error',
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === 'string') {
    return {
      kind: 'error',
      message: error,
    };
  }
  return {
    kind: 'error',
  };
};

export const createUnhandledErrorObservable = (handler: (event: ReactNativeErrorEvent) => void): (() => void) => {
  const errorUtils = (getGlobalScope() as { ErrorUtils?: ErrorUtilsLike } | undefined)?.ErrorUtils;

  if (!errorUtils?.setGlobalHandler || !errorUtils?.getGlobalHandler) {
    return () => undefined;
  }

  let state = errorObserverStates.get(errorUtils);
  if (!state) {
    const previousHandler = errorUtils.getGlobalHandler();
    const observers = new Set<ErrorObserver>();
    state = {
      observers,
      previousHandler: errorUtils.getGlobalHandler(),
      dispatcher: (error, isFatal) => {
        const event = errorToEvent(error);
        for (const observer of Array.from(observers)) {
          observer.handler(event);
        }
        previousHandler?.(error, isFatal);
      },
    };
    errorObserverStates.set(errorUtils, state);
    errorUtils.setGlobalHandler(state.dispatcher);
  }

  const observerState = state;
  const observer = { handler };
  observerState.observers.add(observer);
  let isSubscribed = true;
  return () => {
    if (!isSubscribed) {
      return;
    }
    isSubscribed = false;
    observerState.observers.delete(observer);
    if (observerState.observers.size === 0) {
      if (errorUtils.getGlobalHandler?.() === observerState.dispatcher) {
        errorUtils.setGlobalHandler?.(observerState.previousHandler ?? (() => undefined));
      }
      errorObserverStates.delete(errorUtils);
    }
  };
};

export const createUnhandledRejectionObservable = createUnhandledErrorObservable;

export const createErrorObservable = (handler: (event: ReactNativeErrorEvent) => void): (() => void) => {
  const unsubscribeUnhandledError = createUnhandledErrorObservable(handler);
  return () => {
    unsubscribeUnhandledError();
  };
};
