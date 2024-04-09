import { Event, IdentifyUserProperties } from '@amplitude/analytics-types';
import { EvaluationFlag, EvaluationVariant } from '@amplitude/experiment-core';

export type TargetingFlag = EvaluationFlag;
export interface TargetingParameters {
  event?: Event;
  userProperties?: IdentifyUserProperties;
  deviceId?: string;
  flag: EvaluationFlag;
  sessionId?: string;
}

export interface Targeting {
  evaluateTargeting(args: TargetingParameters): Record<string, EvaluationVariant>;
}
