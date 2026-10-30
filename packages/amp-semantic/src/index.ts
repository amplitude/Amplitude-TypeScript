import { createCapture } from './capture';
import { contextRecorder } from './recorders/context';
import { visibilityRecorder } from './recorders/visibility';
import type { SemanticCaptureConfig, SemanticHost, SemanticRecorder } from './types';

export { contextRecorder, visibilityRecorder };
export const defaultRecorders: readonly SemanticRecorder[] = [contextRecorder, visibilityRecorder];
export * from './types';
export type { SemanticCapture } from './capture';
export { SEMANTIC_CAPS } from './capture';
export { getDocumentIdentity } from './identity';

export function createSemanticCapture(
  config: SemanticCaptureConfig,
  host: SemanticHost,
  recorders: readonly SemanticRecorder[] = defaultRecorders,
) {
  return createCapture(config, host, recorders);
}
