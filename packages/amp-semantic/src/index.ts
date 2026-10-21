import { createCapture } from './capture';
import { interactionsRecorder } from './recorders/interactions';
import { pageRecorder } from './recorders/page';
import { feedbackRecorder } from './recorders/feedback';
import { lifecycleRecorder } from './recorders/lifecycle';
import { clickOutcomeRecorder } from './recorders/click-outcome';
import { analyticsRecorder } from './recorders/analytics';
import type { SemanticCaptureConfig, SemanticHost, SemanticRecorder } from './types';
export { isDeadClickChange, DEAD_CLICK_MUTATION_OBSERVER_OPTIONS } from './activity';

export {
  interactionsRecorder,
  pageRecorder,
  feedbackRecorder,
  lifecycleRecorder,
  clickOutcomeRecorder,
  analyticsRecorder,
};
export const defaultRecorders: readonly SemanticRecorder[] = [
  interactionsRecorder,
  pageRecorder,
  feedbackRecorder,
  lifecycleRecorder,
  clickOutcomeRecorder,
  analyticsRecorder,
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
