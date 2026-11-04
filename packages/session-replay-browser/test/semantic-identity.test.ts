import { getSemanticIdentity, SEMANTIC_TAB_STORAGE_KEY } from '../src/semantic-identity';

function storage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SEMANTIC_TAB_STORAGE_KEY, initial);
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => values.set(key, value)),
  } as unknown as Storage;
}

function page(store: Storage) {
  const scope = Object.assign(new EventTarget(), {
    document: document.implementation.createHTMLDocument('test'),
    sessionStorage: store,
    crypto: window.crypto,
  }) as unknown as Window;
  Object.defineProperty(scope, 'top', { value: scope, configurable: true });
  return scope;
}

describe('semantic replay identity', () => {
  test('shares identity in one document and preserves the tab across navigation and bfcache', () => {
    const store = storage();
    const first = page(store);
    const identity = getSemanticIdentity(first);
    expect(getSemanticIdentity(first)).toBe(identity);
    // A cancelled beforeunload must not release the live owner.
    first.dispatchEvent(new Event('beforeunload'));
    expect(JSON.parse(store.getItem(SEMANTIC_TAB_STORAGE_KEY) ?? '{}').owner).toBe(identity.document_id);
    first.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const next = page(store);
    const nextIdentity = getSemanticIdentity(next);
    expect(nextIdentity.tab_id).toBe(identity.tab_id);
    expect(nextIdentity.document_id).not.toBe(identity.document_id);
    next.dispatchEvent(new PageTransitionEvent('pagehide'));
    first.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(getSemanticIdentity(first)).toBe(identity);
    expect(JSON.parse(store.getItem(SEMANTIC_TAB_STORAGE_KEY) ?? '{}').owner).toBe(identity.document_id);
  });

  test('a duplicate with copied sessionStorage gets a different tab without changing the opener', () => {
    const store = storage();
    const first = getSemanticIdentity(page(store));
    const duplicateStore = storage(store.getItem(SEMANTIC_TAB_STORAGE_KEY) ?? undefined);
    const duplicate = getSemanticIdentity(page(duplicateStore));
    expect(duplicate.tab_id).not.toBe(first.tab_id);
    expect(duplicate.document_id).not.toBe(first.document_id);
    expect(JSON.parse(store.getItem(SEMANTIC_TAB_STORAGE_KEY) ?? '{}').tab_id).toBe(first.tab_id);
  });

  test('independent tabs and corrupt storage produce fresh IDs', () => {
    const first = getSemanticIdentity(page(storage()));
    const second = getSemanticIdentity(page(storage('not json')));
    const invalid = getSemanticIdentity(page(storage('{"tab_id":"bad","owner":null}')));
    expect(new Set([first.tab_id, second.tab_id, invalid.tab_id]).size).toBe(3);
    expect(first.document_id).toMatch(/^[a-f0-9-]{36}$/);
  });

  test('blocked storage falls back to stable in-memory identity', () => {
    const scope = page(storage());
    Object.defineProperty(scope, 'sessionStorage', {
      get: () => {
        throw new Error('blocked');
      },
    });
    const first = getSemanticIdentity(scope);
    expect(getSemanticIdentity(scope)).toBe(first);
    expect(first.tab_id).toEqual(expect.any(String));
    expect(first.document_id).toEqual(expect.any(String));
  });

  test('a failed initial claim does not adopt a stored tab ID', () => {
    const storedId = '2dbe15a7-3c89-4d6c-a807-03d6288e2141';
    const store = storage(JSON.stringify({ tab_id: storedId, owner: null }));
    jest.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const scope = page(store);
    const identity = getSemanticIdentity(scope);
    expect(identity.tab_id).not.toBe(storedId);
    expect(getSemanticIdentity(scope)).toBe(identity);
  });

  test('storage failure on pagehide never changes an already emitted identity', () => {
    const store = storage();
    const scope = page(store);
    const identity = getSemanticIdentity(scope);
    jest.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => scope.dispatchEvent(new PageTransitionEvent('pagehide'))).not.toThrow();
    expect(getSemanticIdentity(scope)).toBe(identity);
  });

  test('child frames do not overwrite the parent tab storage record', () => {
    const store = storage();
    const parent = page(store);
    const parentIdentity = getSemanticIdentity(parent);
    const child = page(store);
    Object.defineProperty(child, 'top', { value: parent });
    const before = store.getItem(SEMANTIC_TAB_STORAGE_KEY);
    const childIdentity = getSemanticIdentity(child);
    expect(store.getItem(SEMANTIC_TAB_STORAGE_KEY)).toBe(before);
    expect(childIdentity.document_id).not.toBe(parentIdentity.document_id);
  });
  test('does not reclaim storage erased before pagehide', () => {
    const store = storage();
    const scope = page(store);
    const identity = getSemanticIdentity(scope);
    jest.spyOn(store, 'getItem').mockReturnValue(null);
    const writes = jest.spyOn(store, 'setItem');
    writes.mockClear();
    scope.dispatchEvent(new Event('pagehide'));
    expect(writes).not.toHaveBeenCalled();
    expect(getSemanticIdentity(scope)).toBe(identity);
  });
});
