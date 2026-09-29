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

const errorEventToEvent = (event: Event): ReactNativeErrorEvent | undefined => {
  if (typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent) {
    const output = errorToEvent(event.error);
    return {
      ...output,
      filename: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
    };
  }

  const candidate = event as Event & {
    error?: unknown;
    message?: unknown;
    filename?: unknown;
    lineno?: unknown;
    colno?: unknown;
  };
  if (!('error' in candidate) && !('message' in candidate)) {
    return undefined;
  }

  const output = errorToEvent(candidate.error ?? candidate.message);
  return {
    ...output,
    filename: typeof candidate.filename === 'string' ? candidate.filename : undefined,
    lineNumber: typeof candidate.lineno === 'number' ? candidate.lineno : undefined,
    columnNumber: typeof candidate.colno === 'number' ? candidate.colno : undefined,
  };
};

export const createUnhandledErrorObservable = (handler: (event: ReactNativeErrorEvent) => void): (() => void) => {
  const subscriptions: (() => void)[] = [];
  const globalScope = getGlobalScope();
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;

  if (globalScope?.addEventListener && globalScope?.removeEventListener) {
    const errorHandler = (event: Event) => {
      const errorEvent = errorEventToEvent(event);
      if (errorEvent) {
        handler(errorEvent);
      }
    };
    globalScope.addEventListener('error', errorHandler);
    subscriptions.push(() => globalScope.removeEventListener('error', errorHandler));
  }

  if (errorUtils?.setGlobalHandler && errorUtils?.getGlobalHandler) {
    const previousHandler = errorUtils.getGlobalHandler();
    const errorHandler: ErrorUtilsGlobalHandler = (error, isFatal) => {
      handler(errorToEvent(error));
      previousHandler?.(error, isFatal);
    };
    errorUtils.setGlobalHandler(errorHandler);
    subscriptions.push(() => {
      if (errorUtils.getGlobalHandler?.() === errorHandler) {
        errorUtils.setGlobalHandler?.(previousHandler ?? (() => undefined));
      }
    });
  }

  return () => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
  };
};

export const createUnhandledRejectionObservable = (handler: (event: ReactNativeErrorEvent) => void): (() => void) => {
  const globalScope = getGlobalScope();
  if (!globalScope?.addEventListener || !globalScope?.removeEventListener) {
    return () => undefined;
  }

  const rejectionHandler = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const output = errorToEvent(reason);
    handler({
      ...output,
      kind: 'unhandledrejection',
    });
  };
  globalScope.addEventListener('unhandledrejection', rejectionHandler);
  return () => {
    globalScope.removeEventListener('unhandledrejection', rejectionHandler);
  };
};

export const createErrorObservable = (handler: (event: ReactNativeErrorEvent) => void): (() => void) => {
  const unsubscribeUnhandledError = createUnhandledErrorObservable(handler);
  const unsubscribeUnhandledRejection = createUnhandledRejectionObservable(handler);
  return () => {
    unsubscribeUnhandledError();
    unsubscribeUnhandledRejection();
  };
};
