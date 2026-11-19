import { createCapture, DEFAULT_SEMANTIC_CAP } from './capture';
import { visibilityRecorder } from './recorders/visibility';
import { contextRecorder } from './recorders/context';
import { lifecycleRecorder } from './recorders/lifecycle';
import { navigationRecorder } from './recorders/navigation';
import { recordingRecorder } from './recorders/recording';
import { interactionsRecorder } from './recorders/interactions';
import { keysRecorder } from './recorders/keys';
import { resourceErrorRecorder } from './recorders/resource-error';
import type { SemanticCaptureConfig, SemanticHost, SemanticRecorder } from './types';

export { createCapture, DEFAULT_SEMANTIC_CAP } from './capture';
export {
  contextRecorder,
  visibilityRecorder,
  lifecycleRecorder,
  navigationRecorder,
  recordingRecorder,
  interactionsRecorder,
  keysRecorder,
  resourceErrorRecorder,
};
export const defaultRecorders: readonly SemanticRecorder[] = [
  contextRecorder,
  visibilityRecorder,
  lifecycleRecorder,
  navigationRecorder,
  recordingRecorder,
  interactionsRecorder,
  keysRecorder,
  resourceErrorRecorder,
];
export const SEMANTIC_CAPS = {
  context: DEFAULT_SEMANTIC_CAP,
  visibility: DEFAULT_SEMANTIC_CAP,
  lifecycle: DEFAULT_SEMANTIC_CAP,
  navigation: DEFAULT_SEMANTIC_CAP,
  recording: DEFAULT_SEMANTIC_CAP,
  click: 2000,
  field: 1000,
  submit: 300,
  keys: 1000,
  'resource-error': 200,
};
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
