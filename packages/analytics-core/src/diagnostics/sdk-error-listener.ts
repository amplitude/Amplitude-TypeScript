import { getGlobalScope } from '../global-scope';

interface Recorder {
  recordEvent(name: string, properties: Record<string, unknown>): void;
  isStorageAndTrackEnabled(): boolean;
}

type ErrorEventType = 'error' | 'unhandledrejection';

interface CapturedErrorContext {
  readonly type: ErrorEventType;
  readonly message: string;
  readonly stack?: string;
  readonly filename?: string;
  readonly errorName?: string;
  readonly metadata?: Record<string, unknown>;
}

interface LoaderMetadata {
  scriptUrl?: string;
  stackFrameHints?: readonly string[];
}

interface GlobalState {
  scriptUrl?: string;
  normalizedScriptUrl?: string;
  listenersInstalled: boolean;
  recorders: Set<Recorder>;
  stackFrameHints: Set<string>;
  errorListener?: (event: ErrorEvent) => void;
  rejectionListener?: (event: PromiseRejectionEvent) => void;
}

const GLOBAL_KEY = '__AMPLITUDE_SDK_ERROR_STATE__';
const EVENT_NAME = 'sdk.errors.unhandled';

const ensureState = (): GlobalState | null => {
  const scope = getGlobalScope() as Record<string, unknown> | null;
  if (!scope) {
    return null;
  }

  if (!scope[GLOBAL_KEY]) {
    scope[GLOBAL_KEY] = {
      listenersInstalled: false,
      recorders: new Set<Recorder>(),
      stackFrameHints: new Set<string>(),
    } as GlobalState;
  }

  return scope[GLOBAL_KEY] as GlobalState;
};

export const registerSdkLoaderMetadata = (metadata: LoaderMetadata) => {
  const state = ensureState();
  if (!state) {
    return;
  }

  if (metadata.scriptUrl) {
    state.scriptUrl = metadata.scriptUrl;
    state.normalizedScriptUrl = normalizeUrl(metadata.scriptUrl);
  }

  if (metadata.stackFrameHints?.length) {
    addStackFrameHints(state, metadata.stackFrameHints);
  }
};

export const enableSdkErrorListeners = (recorder: Recorder) => {
  const state = ensureState();
  const scope = getGlobalScope();

  if (!state || !scope || typeof scope.addEventListener !== 'function') {
    return;
  }

  state.recorders.add(recorder);

  if (state.listenersInstalled) {
    return;
  }

  const handleError = (event: ErrorEvent) => {
    const match = detectSdkOrigin(state, { filename: event.filename, stack: event.error?.stack });
    if (!match) {
      return;
    }

    capture({
      type: 'error',
      message: event.message,
      stack: event.error?.stack,
      filename: event.filename,
      errorName: event.error?.name,
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
    const match = detectSdkOrigin(state, { filename, stack });

    if (!match) {
      return;
    }

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
    state.recorders.forEach((registeredRecorder) => {
      if (!registeredRecorder.isStorageAndTrackEnabled()) {
        return;
      }
      registeredRecorder.recordEvent(EVENT_NAME, {
        type: context.type,
        message: context.message,
        filename: context.filename,
        error_name: context.errorName,
        stack: context.stack,
        ...context.metadata,
        source: metadataToSource(context.metadata),
        integration: 'sdk-error-listener/v1',
      });
    });
  };

  scope.addEventListener('error', handleError, true);
  scope.addEventListener('unhandledrejection', handleRejection, true);

  state.errorListener = handleError;
  state.rejectionListener = handleRejection;
  state.listenersInstalled = true;
};

const detectSdkOrigin = (
  state: GlobalState,
  payload: { filename?: string; stack?: string },
): 'filename' | 'stack' | 'stack-hint' | undefined => {
  if (!state.normalizedScriptUrl) {
    const hintMatch = matchStackFrameHint(state, payload.stack);
    if (hintMatch) {
      return 'stack-hint';
    }
  } else {
    if (normalizeUrl(payload.filename) === state.normalizedScriptUrl) {
      return 'filename';
    }

    if (payload.stack && payload.stack.includes(state.normalizedScriptUrl)) {
      return 'stack';
    }

    const hintMatch = matchStackFrameHint(state, payload.stack);
    if (hintMatch) {
      return 'stack-hint';
    }
  }

  return undefined;
};

const matchStackFrameHint = (state: GlobalState, stack?: string) => {
  if (!stack || state.stackFrameHints.size === 0) {
    return undefined;
  }
  for (const hint of state.stackFrameHints) {
    if (hint && stack.includes(hint)) {
      return hint;
    }
  }
  return undefined;
};

const addStackFrameHints = (state: GlobalState, hints: readonly string[]) => {
  hints.forEach((hint) => {
    const sanitized = sanitizeHint(hint);
    if (sanitized) {
      state.stackFrameHints.add(sanitized);
    }
  });
};

const sanitizeHint = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 200);
};

const metadataToSource = (metadata?: Record<string, unknown>) => {
  return metadata?.matchReason === 'stack-hint' ? 'module-bundle' : 'script-tag';
};

const normalizeUrl = (value?: string) => {
  if (!value) {
    return undefined;
  }

  try {
    const withoutHash = value.split('#')[0];
    const withoutQuery = withoutHash.split('?')[0];
    return withoutQuery;
  } catch {
    return value;
  }
};

const extractFilenameFromStack = (stack?: string) => {
  if (!stack) {
    return undefined;
  }

  const match = stack.match(/(https?:\/\/\S+?)(?=[)\s]|$)/);
  return match ? match[1] : undefined;
};

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

export const __TEST__ = {
  normalizeUrl,
  extractFilenameFromStack,
};
