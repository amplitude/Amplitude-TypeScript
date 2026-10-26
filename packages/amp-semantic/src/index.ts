import { createCapture } from './capture';
import { interactionsRecorder } from './recorders/interactions';
import { feedbackRecorder } from './recorders/feedback';
import { navigationRecorder } from './recorders/navigation';
import { lifecycleRecorder } from './recorders/lifecycle';
import { keysRecorder } from './recorders/keys';
import { resourceErrorRecorder } from './recorders/resource-error';
import { analyticsRecorder } from './recorders/analytics';
import type { SemanticCaptureConfig, SemanticHost, SemanticRecorder } from './types';

export {
  interactionsRecorder,
  feedbackRecorder,
  lifecycleRecorder,
  navigationRecorder,
  analyticsRecorder,
  keysRecorder,
  resourceErrorRecorder,
};
export const defaultRecorders: readonly SemanticRecorder[] = [
  interactionsRecorder,
  feedbackRecorder,
  lifecycleRecorder,
  navigationRecorder,
  analyticsRecorder,
  keysRecorder,
  resourceErrorRecorder,
];

export * from './types';
export type { SemanticCapture } from './capture';
export { SEMANTIC_CAPS } from './capture';
export { createHelpers, roleOf, urlTemplate } from './helpers';
export { getDocumentIdentity } from './identity';

export function createSemanticCapture(
  config: SemanticCaptureConfig,
  host: SemanticHost,
  recorders: readonly SemanticRecorder[] = defaultRecorders,
) {
  return createCapture(config, host, recorders);
}
