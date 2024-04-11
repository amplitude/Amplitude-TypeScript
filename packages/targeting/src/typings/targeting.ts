<<<<<<< HEAD
import { Event, Logger } from '@amplitude/analytics-types';
=======
import { Event } from '@amplitude/analytics-types';
>>>>>>> 8243269e (feat(session replay): evaluate targeting with user properties in initialization)
import { EvaluationFlag, EvaluationVariant } from '@amplitude/experiment-core';

export type TargetingFlag = EvaluationFlag;
export interface TargetingParameters {
  event?: Event;
  userProperties?: { [key: string]: any };
  deviceId?: string;
  flag: EvaluationFlag;
  sessionId: number;
<<<<<<< HEAD
  apiKey: string;
  loggerProvider: Logger;
}

export interface Targeting {
  evaluateTargeting: (args: TargetingParameters) => Promise<Record<string, EvaluationVariant>>;
=======
}

export interface Targeting {
  evaluateTargeting: (args: TargetingParameters) => Record<string, EvaluationVariant>;
>>>>>>> 8243269e (feat(session replay): evaluate targeting with user properties in initialization)
}
