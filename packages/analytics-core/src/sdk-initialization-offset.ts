import { getGlobalScope } from './global-scope';

/** Milliseconds from the document navigation time origin until this SDK first started. */
export const AMPLITUDE_EVENT_PROP_SDK_INITIALIZATION_OFFSET = '[Amplitude] SDK Initialization Offset';

const SDK_INITIALIZATION_OFFSET_STATE = Symbol.for('@amplitude/sdk-initialization-offset');

interface SdkInitializationOffsetState {
  byApiKey: Record<string, number>;
}

type OffsetScope = NonNullable<ReturnType<typeof getGlobalScope>> &
  Record<symbol, SdkInitializationOffsetState | undefined>;

const storageKeyFor = (apiKey: string | undefined): string => apiKey || '';

const getOffsetScope = (): OffsetScope | undefined => getGlobalScope() as OffsetScope | undefined;

/**
 * Time from the current document's navigation start until the SDK first initialized
 * for this project. Later calls, including SPA page views, return that same sample.
 */
export const getSdkInitializationOffset = (apiKey?: string): number => {
  const scope = getOffsetScope();
  if (!scope) {
    return 0;
  }

  let state = scope[SDK_INITIALIZATION_OFFSET_STATE];
  if (!state) {
    state = { byApiKey: {} };
    scope[SDK_INITIALIZATION_OFFSET_STATE] = state;
  }

  const key = storageKeyFor(apiKey);
  const cached = state.byApiKey[key];
  if (typeof cached === 'number') {
    return cached;
  }

  const offset = readNavigationOffset(scope);
  state.byApiKey[key] = offset;
  return offset;
};

/** Test helper. Drops the cached sample so the next read measures again. */
export const clearSdkInitializationOffset = (): void => {
  const scope = getOffsetScope();
  if (scope) {
    delete scope[SDK_INITIALIZATION_OFFSET_STATE];
  }
};

const readNavigationOffset = (scope: OffsetScope): number => {
  try {
    const now = scope.performance?.now?.();
    if (typeof now !== 'number' || !Number.isFinite(now)) {
      return 0;
    }
    return Math.max(0, Math.floor(now));
  } catch {
    return 0;
  }
};
