import { createCapture, DEFAULT_SEMANTIC_CAP } from './capture';
import { visibilityRecorder } from './recorders/visibility';
import { contextRecorder } from './recorders/context';
import type { SemanticCaptureConfig, SemanticHost, SemanticRecorder } from './types';

export { createCapture, DEFAULT_SEMANTIC_CAP } from './capture';
export { contextRecorder, visibilityRecorder };
export const defaultRecorders: readonly SemanticRecorder[] = [contextRecorder, visibilityRecorder];
export const SEMANTIC_CAPS = { context: DEFAULT_SEMANTIC_CAP, visibility: DEFAULT_SEMANTIC_CAP };
export * from './types';
export type { SemanticCapture } from './capture';
export { getDocumentIdentity } from './identity';

export function createSemanticCapture(
  config: SemanticCaptureConfig,
  host: SemanticHost,
  recorders: readonly SemanticRecorder[] = defaultRecorders,
) {
  return createCapture(config, host, recorders, SEMANTIC_CAPS);
}
