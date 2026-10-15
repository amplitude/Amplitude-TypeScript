import { getGlobalScope } from './global-scope';
import { UUID } from './utils/uuid';

/**
 * Session storage key shared by page view tracking and autocapture.
 * `pageViewId` is the legacy single-id field. `byApiKey` keeps one id per project
 * so a second SDK cannot replace another project's id.
 */
export const PAGE_VIEW_SESSION_STORAGE_KEY = 'AMP_PAGE_VIEW';

const PAGE_VIEW_STATE = Symbol.for('@amplitude/page-view-state');

interface PageViewEntry {
  pageViewId: string;
  href: string;
}

interface PageViewState {
  byApiKey: Record<string, PageViewEntry>;
}

interface StoredPageViews {
  pageViewId?: unknown;
  byApiKey?: unknown;
}

type PageViewScope = NonNullable<ReturnType<typeof getGlobalScope>> & Record<symbol, PageViewState | undefined>;

const storageKeyFor = (apiKey: string | undefined): string => apiKey || '';

const getScope = (): PageViewScope | undefined => getGlobalScope() as PageViewScope | undefined;

const readState = (): PageViewState | undefined => getScope()?.[PAGE_VIEW_STATE];

const readStored = (scope: PageViewScope | undefined = getScope()): StoredPageViews | undefined => {
  try {
    const raw = scope?.sessionStorage?.getItem(PAGE_VIEW_SESSION_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    return parsed as StoredPageViews;
  } catch {
    return undefined;
  }
};

const copyStoredIds = (byApiKey: unknown): Record<string, string> => {
  const ids: Record<string, string> = {};
  if (!byApiKey || typeof byApiKey !== 'object') {
    return ids;
  }
  for (const [key, value] of Object.entries(byApiKey as Record<string, unknown>)) {
    if (typeof value === 'string') {
      ids[key] = value;
    }
  }
  return ids;
};

const persistPageViewId = (scope: PageViewScope, apiKey: string | undefined, pageViewId: string): void => {
  try {
    const storage = scope.sessionStorage;
    if (!storage) {
      return;
    }
    const byApiKey = copyStoredIds(readStored(scope)?.byApiKey);
    const key = storageKeyFor(apiKey);
    if (key) {
      byApiKey[key] = pageViewId;
    }
    storage.setItem(
      PAGE_VIEW_SESSION_STORAGE_KEY,
      JSON.stringify({
        pageViewId,
        ...(Object.keys(byApiKey).length > 0 ? { byApiKey } : {}),
      }),
    );
  } catch {
    // sessionStorage can throw in sandboxed documents
  }
};

/**
 * Returns the page view id for this project and document URL.
 * Another SDK initialized with the same API key reuses the id for the current
 * page instead of overwriting the value autocapture later reads.
 */
export const getOrCreatePageViewId = (apiKey: string | undefined, href: string): string | undefined => {
  const scope = getScope();
  if (!scope) {
    return undefined;
  }
  const key = storageKeyFor(apiKey);
  const state = scope[PAGE_VIEW_STATE] ?? { byApiKey: {} };
  const existing = state.byApiKey[key];
  if (existing && existing.href === href) {
    persistPageViewId(scope, apiKey, existing.pageViewId);
    return existing.pageViewId;
  }
  const pageViewId = UUID();
  state.byApiKey[key] = { pageViewId, href };
  scope[PAGE_VIEW_STATE] = state;
  persistPageViewId(scope, apiKey, pageViewId);
  return pageViewId;
};

const readScopedStoredId = (apiKey: string | undefined): string | undefined => {
  const stored = readStored();
  if (!stored) {
    return undefined;
  }
  const key = storageKeyFor(apiKey);
  if (key && stored.byApiKey && typeof stored.byApiKey === 'object') {
    const scoped = (stored.byApiKey as Record<string, unknown>)[key];
    return typeof scoped === 'string' ? scoped : undefined;
  }
  return typeof stored.pageViewId === 'string' ? stored.pageViewId : undefined;
};

/** Reads the current page view id for a project, from memory or session storage. */
export const getCurrentPageViewId = (apiKey?: string): string | undefined => {
  const inMemory = readState()?.byApiKey[storageKeyFor(apiKey)]?.pageViewId;
  if (inMemory) {
    return inMemory;
  }
  return readScopedStoredId(apiKey);
};

/** Drops in-memory page view ids. Session storage is left unchanged. */
export const clearPageViewState = (): void => {
  const scope = getScope();
  if (scope) {
    delete scope[PAGE_VIEW_STATE];
  }
};
