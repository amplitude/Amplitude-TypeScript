import * as globalScope from '../src/global-scope';
import {
  PAGE_VIEW_SESSION_STORAGE_KEY,
  clearPageViewState,
  getCurrentPageViewId,
  getOrCreatePageViewId,
} from '../src/page-view-id';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const readStored = (): { pageViewId?: unknown; byApiKey?: Record<string, unknown> } | undefined => {
  const raw = (globalThis as { sessionStorage?: Storage }).sessionStorage?.getItem(PAGE_VIEW_SESSION_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { pageViewId?: unknown; byApiKey?: Record<string, unknown> }) : undefined;
};

describe('page view id', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = storage;
    jest.spyOn(globalScope, 'getGlobalScope').mockImplementation(() => globalThis);
    clearPageViewState();
  });

  afterEach(() => {
    clearPageViewState();
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    jest.restoreAllMocks();
  });

  test('reuses one id per project and url, and isolates projects', () => {
    const first = getOrCreatePageViewId('api-a', 'https://example.com/a');
    expect(getOrCreatePageViewId('api-a', 'https://example.com/a')).toBe(first);

    const otherProject = getOrCreatePageViewId('api-b', 'https://example.com/a');
    expect(otherProject).not.toBe(first);

    const nextPage = getOrCreatePageViewId('api-a', 'https://example.com/b');
    expect(nextPage).not.toBe(first);
    expect(getCurrentPageViewId('api-a')).toBe(nextPage);
    expect(getCurrentPageViewId('api-b')).toBe(otherProject);

    const stored = readStored();
    expect(stored?.byApiKey).toEqual({
      'api-a': nextPage,
      'api-b': otherProject,
    });

    clearPageViewState();
    expect(getCurrentPageViewId('api-a')).toBe(nextPage);
    expect(getCurrentPageViewId('api-b')).toBe(otherProject);
    expect(getCurrentPageViewId('missing')).toBeUndefined();
  });

  test('keeps an id in memory when session storage is unavailable', () => {
    const scope = { crypto: globalThis.crypto } as typeof globalThis;
    jest.spyOn(globalScope, 'getGlobalScope').mockReturnValue(scope);

    const pageViewId = getOrCreatePageViewId('api-a', 'https://example.com/a');
    expect(pageViewId).toEqual(expect.any(String));
    expect(getOrCreatePageViewId('api-a', 'https://example.com/a')).toBe(pageViewId);
    expect(getCurrentPageViewId('api-a')).toBe(pageViewId);

    clearPageViewState();
    expect(getCurrentPageViewId('api-a')).toBeUndefined();
  });

  test('returns undefined when there is no global scope', () => {
    jest.spyOn(globalScope, 'getGlobalScope').mockReturnValue(undefined);

    expect(getOrCreatePageViewId('api-a', 'https://example.com/a')).toBeUndefined();
    expect(getCurrentPageViewId('api-a')).toBeUndefined();
    expect(() => clearPageViewState()).not.toThrow();
  });

  test('reads a legacy session storage payload that has no per-project map', () => {
    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, JSON.stringify({ pageViewId: 'legacy-id' }));

    expect(getCurrentPageViewId('api-a')).toBe('legacy-id');
    expect(getCurrentPageViewId()).toBe('legacy-id');
  });

  test('ignores invalid session storage payloads', () => {
    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, JSON.stringify({ pageViewId: 12 }));
    expect(getCurrentPageViewId()).toBeUndefined();
    expect(getCurrentPageViewId('api-a')).toBeUndefined();

    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, 'not-json');
    expect(getCurrentPageViewId()).toBeUndefined();

    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, 'null');
    expect(getCurrentPageViewId()).toBeUndefined();

    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, '5');
    expect(getCurrentPageViewId()).toBeUndefined();

    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, JSON.stringify({ pageViewId: 'legacy', byApiKey: { 'api-a': 5 } }));
    expect(getCurrentPageViewId('api-a')).toBeUndefined();

    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, JSON.stringify({ pageViewId: 'legacy', byApiKey: 'nope' }));
    expect(getCurrentPageViewId('api-a')).toBe('legacy');
  });

  test('merges stored project ids and drops non-string entries', () => {
    storage.setItem(
      PAGE_VIEW_SESSION_STORAGE_KEY,
      JSON.stringify({ pageViewId: 'legacy', byApiKey: { keep: 'kept', drop: 1 } }),
    );

    const pageViewId = getOrCreatePageViewId('api-c', 'https://example.com/c');
    expect(readStored()?.byApiKey).toEqual({
      keep: 'kept',
      'api-c': pageViewId,
    });
  });

  test('replaces a non-object project map when minting an id', () => {
    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, JSON.stringify({ pageViewId: 'legacy', byApiKey: 'nope' }));

    const pageViewId = getOrCreatePageViewId('api-a', 'https://example.com/a');
    expect(readStored()).toEqual({
      pageViewId,
      byApiKey: { 'api-a': pageViewId },
    });
  });

  test('writes a project id into an empty project map', () => {
    storage.setItem(PAGE_VIEW_SESSION_STORAGE_KEY, JSON.stringify({ pageViewId: 'legacy', byApiKey: {} }));

    const pageViewId = getOrCreatePageViewId('api-a', 'https://example.com/a');
    expect(readStored()?.byApiKey).toEqual({ 'api-a': pageViewId });
  });

  test('stores an unscoped id without a project map', () => {
    const pageViewId = getOrCreatePageViewId(undefined, 'https://example.com/a');
    expect(getOrCreatePageViewId('', 'https://example.com/a')).toBe(pageViewId);
    expect(readStored()).toEqual({ pageViewId });

    clearPageViewState();
    expect(getCurrentPageViewId()).toBe(pageViewId);
  });

  test('still returns the in-memory id when session storage throws', () => {
    jest.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const pageViewId = getOrCreatePageViewId('api-a', 'https://example.com/a');
    expect(pageViewId).toEqual(expect.any(String));
    expect(getCurrentPageViewId('api-a')).toBe(pageViewId);

    clearPageViewState();
    jest.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getCurrentPageViewId('api-a')).toBeUndefined();
  });

  test('ignores session storage access errors while publishing an id', () => {
    const scope = {
      crypto: globalThis.crypto,
      get sessionStorage(): Storage {
        throw new Error('insecure');
      },
    } as typeof globalThis;
    jest.spyOn(globalScope, 'getGlobalScope').mockReturnValue(scope);

    const pageViewId = getOrCreatePageViewId('api-a', 'https://example.com/a');
    expect(pageViewId).toEqual(expect.any(String));

    clearPageViewState();
    expect(getCurrentPageViewId('api-a')).toBeUndefined();
  });
});
