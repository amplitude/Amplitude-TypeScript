import { Event, IdentifyUserProperties } from '@amplitude/analytics-types';
import { EvaluationFlag, EvaluationVariant } from '@amplitude/experiment-core';
export interface TargetingParameters {
  event?: Event;
  userProperties?: IdentifyUserProperties;
  deviceId: string;
  flag: EvaluationFlag;
}

export interface Targeting {
  evaluateTargeting(args: TargetingParameters): Record<string, EvaluationVariant>;
}
