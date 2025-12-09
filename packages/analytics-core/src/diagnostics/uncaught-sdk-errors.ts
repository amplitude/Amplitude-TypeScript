import { getGlobalScope } from '../global-scope';
import { IDiagnosticsClient } from './diagnostics-client';

type ErrorEventType = 'error' | 'unhandledrejection';

interface CapturedErrorContext {
  readonly type: ErrorEventType;
  readonly message: string;
  readonly stack?: string;
  readonly filename?: string;
  readonly errorName?: string;
  readonly metadata?: Record<string, unknown>;
}

export const GLOBAL_KEY = '__AMPLITUDE_SCRIPT_URL__';
export const EVENT_NAME_ERROR_UNCAUGHT = 'sdk.error.uncaught';

const getNormalizedScriptUrl = (): string | undefined => {
  const scope = getGlobalScope() as Record<string, unknown> | null;
  /* istanbul ignore next */
  return scope?.[GLOBAL_KEY] as string | undefined;
};

const setNormalizedScriptUrl = (url: string) => {
  const scope = getGlobalScope() as Record<string, unknown> | null;
  if (scope) {
    scope[GLOBAL_KEY] = url;
  }
};

export const registerSdkLoaderMetadata = (metadata: { scriptUrl?: string }) => {
  if (metadata.scriptUrl) {
    const normalized = normalizeUrl(metadata.scriptUrl);
    if (normalized) {
      setNormalizedScriptUrl(normalized);
    }
  }
};

export const enableSdkErrorListeners = (client: IDiagnosticsClient) => {
  const scope = getGlobalScope();

  if (!scope || typeof scope.addEventListener !== 'function') {
    return;
  }

  const handleError = (event: ErrorEvent) => {
    const error = event.error instanceof Error ? event.error : undefined;
    const stack = error?.stack;
    const match = detectSdkOrigin({ filename: event.filename, stack });
    if (!match) {
      return;
    }

    capture({
      type: 'error',
      message: event.message,
      stack,
      filename: event.filename,
      errorName: error?.name,
      metadata: {
        colno: event.colno,
        lineno: event.lineno,
        isTrusted: event.isTrusted,
        matchReason: match,
      },
    });
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : undefined;
    const stack = error?.stack;
    const filename = extractFilenameFromStack(stack);
    const match = detectSdkOrigin({ filename, stack });

    if (!match) {
      return;
    }

    /* istanbul ignore next */
    capture({
      type: 'unhandledrejection',
      message: error?.message ?? stringifyReason(event.reason),
      stack,
      filename,
      errorName: error?.name,
      metadata: {
        isTrusted: event.isTrusted,
        matchReason: match,
      },
    });
  };

  const capture = (context: CapturedErrorContext) => {
    client.recordEvent(EVENT_NAME_ERROR_UNCAUGHT, {
      type: context.type,
      message: context.message,
      filename: context.filename,
      error_name: context.errorName,
      stack: context.stack,
      ...context.metadata,
    });
  };

  scope.addEventListener('error', handleError, true);
  scope.addEventListener('unhandledrejection', handleRejection, true);
};

const detectSdkOrigin = (payload: { filename?: string; stack?: string }): 'filename' | 'stack' | undefined => {
  const normalizedScriptUrl = getNormalizedScriptUrl();
  if (!normalizedScriptUrl) {
    return undefined;
  }

  if (payload.filename && payload.filename.includes(normalizedScriptUrl)) {
    return 'filename';
  }

  if (payload.stack && payload.stack.includes(normalizedScriptUrl)) {
    return 'stack';
  }

  return undefined;
};

const normalizeUrl = (value: string) => {
  try {
    /* istanbul ignore next */
    const url = new URL(value, getGlobalScope()?.location?.origin);
    return url.origin + url.pathname;
  } catch {
    return undefined;
  }
};

const extractFilenameFromStack = (stack?: string) => {
  if (!stack) {
    return undefined;
  }

  const match = stack.match(/(https?:\/\/\S+?)(?=[)\s]|$)/);
  /* istanbul ignore next */
  return match ? match[1] : undefined;
};

/* istanbul ignore next */
const stringifyReason = (reason: unknown) => {
  if (typeof reason === 'string') {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return '[object Object]';
  }
};
