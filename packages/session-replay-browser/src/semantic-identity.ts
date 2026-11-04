import { getDocumentIdentity, SemanticIdentity } from '@amplitude/amp-semantic';

export const SEMANTIC_TAB_STORAGE_KEY = 'AMP_semantic_tab_v1';
const identities = new WeakMap<Document, SemanticIdentity>();
type StoredTab = { tab_id: string; owner: string | null };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Called only when semantic capture accepts an event. Shared by SDK instances in this document. */
export function getSemanticIdentity(scope: Window): SemanticIdentity {
  const document = scope.document;
  const existing = identities.get(document);
  if (existing) return existing;
  let identity = getDocumentIdentity(document, scope);
  // Child frames share their parent's sessionStorage. Do not claim its tab record.
  if (scope.top === scope) {
    try {
      const storage = scope.sessionStorage;
      const read = (): StoredTab | undefined => {
        try {
          const value = JSON.parse(storage.getItem(SEMANTIC_TAB_STORAGE_KEY) ?? 'null') as StoredTab | null;
          if (value && uuidPattern.test(value.tab_id) && (value.owner === null || typeof value.owner === 'string')) {
            return value;
          }
        } catch {
          // Corrupt or blocked storage is equivalent to no saved identity.
        }
        return undefined;
      };
      const stored = read();
      // A copied record still owned by a live document belongs to the opener/duplicated tab.
      if (stored?.owner === null) identity = Object.freeze({ ...identity, tab_id: stored.tab_id });
      const write = (owner: string | null) => {
        try {
          storage.setItem(SEMANTIC_TAB_STORAGE_KEY, JSON.stringify({ tab_id: identity.tab_id, owner }));
        } catch {
          // Keep the current in-memory identity stable if storage becomes unavailable.
        }
      };
      storage.setItem(
        SEMANTIC_TAB_STORAGE_KEY,
        JSON.stringify({ tab_id: identity.tab_id, owner: identity.document_id }),
      );
      scope.addEventListener('pagehide', () => {
        // Release on actual navigation, not beforeunload (which can be cancelled).
        // This also allows same-tab navigation while the current document enters bfcache.
        if (read()?.owner === identity.document_id) write(null);
      });
      scope.addEventListener('pageshow', (event) => {
        if (event.persisted) write(identity.document_id);
      });
    } catch {
      // No storage access: identity lasts for this document only.
      identity = getDocumentIdentity(document, scope);
    }
  }
  identities.set(document, identity);
  return identity;
}
