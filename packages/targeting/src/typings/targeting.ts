import { Event } from '@amplitude/analytics-types';
import { EvaluationFlag, EvaluationVariant } from '@amplitude/experiment-core';

export type TargetingFlag = EvaluationFlag;
export interface TargetingParameters {
  event?: Event;
  userProperties?: { [key: string]: any };
  deviceId?: string;
  flag: EvaluationFlag;
  sessionId: number;
}

export interface Targeting {
  evaluateTargeting: (args: TargetingParameters) => Record<string, EvaluationVariant>;
}
