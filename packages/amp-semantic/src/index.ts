import { createCapture } from './capture';
import type { SemanticCaptureConfig, SemanticHost, SemanticPayloads, SemanticRecorder } from './types';

export * from './types';
export type { SemanticCapture } from './capture';
export { DEFAULT_SEMANTIC_CAP } from './capture';
export { getDocumentIdentity } from './identity';

/** Starts only the supplied recorders; no event families are installed by default. */
export function createSemanticCapture<P extends object = SemanticPayloads>(
  config: SemanticCaptureConfig<P>,
  host: SemanticHost<P>,
  recorders: readonly SemanticRecorder<P>[] = [],
  caps: Partial<Record<Extract<keyof P, string>, number>> = {},
) {
  return createCapture(config, host, recorders, caps);
}
