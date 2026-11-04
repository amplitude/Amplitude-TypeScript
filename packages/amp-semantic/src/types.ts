/** Version of the shared semantic payload envelope. */
export const SEMANTIC_VERSION = 1;

/** Correlation identifiers supplied by a future capture host. */
export interface SemanticIdentity {
  readonly tab_id: string;
  readonly document_id: string;
}

/** Internal event envelope, independent of any event family or replay transport. */
export interface SemanticEventEnvelope<Name extends string, Payload extends object> {
  name: Name;
  timestamp: number;
  payload: Payload & SemanticIdentity & { v: typeof SEMANTIC_VERSION };
}
