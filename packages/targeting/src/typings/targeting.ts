import { Event, Logger } from '@amplitude/analytics-types';
import { EvaluationFlag, EvaluationVariant } from '@amplitude/experiment-core';

export type TargetingFlag = EvaluationFlag;
export interface TargetingParameters {
  event?: Event;
  userProperties?: { [key: string]: any };
  deviceId?: string;
  flag: EvaluationFlag;
  sessionId: string | number;
  apiKey: string;
  loggerProvider: Logger;
}

export interface Targeting {
  evaluateTargeting: (args: TargetingParameters) => Promise<Record<string, EvaluationVariant>>;
}
