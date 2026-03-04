import { Event, Logger } from '@amplitude/analytics-types';
import { EvaluationFlag, EvaluationVariant } from '@amplitude/experiment-core';

export type TargetingFlag = EvaluationFlag;

/** Page data passed into targeting so the evaluator can use the current URL (or other page data). */
export interface TargetingPage {
  url?: string;
}

export interface TargetingParameters {
  event?: Event;
  userProperties?: { [key: string]: any };
  deviceId?: string;
  /**
   * Page data (e.g. current page URL) for context in targeting evaluation.
   * Used to populate context.page in the evaluation engine.
   */
  page?: TargetingPage;
  flag: EvaluationFlag;
  sessionId: string | number;
  apiKey: string;
  loggerProvider: Logger;
}

export interface Targeting {
  evaluateTargeting: (args: TargetingParameters) => Promise<Record<string, EvaluationVariant>>;
}
