import type { SemanticIdentity } from './types';

const identities = new WeakMap<Document, SemanticIdentity>();

function uuid(scope: Window): string {
  try {
    return scope.crypto.randomUUID();
  } catch {
    // Correlation IDs, not credentials. Also supports HTTP and older browsers.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const value = (Math.random() * 16) | 0;
      return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
    });
  }
}

/** No storage or listeners. Hosts can supply persistent tab identity through getIdentity. */
export function getDocumentIdentity(document: Document, scope: Window): SemanticIdentity {
  let identity = identities.get(document);
  if (!identity) {
    identity = Object.freeze({ tab_id: uuid(scope), document_id: uuid(scope) });
    identities.set(document, identity);
  }
  return identity;
}
