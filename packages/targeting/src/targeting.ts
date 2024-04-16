import { EvaluationEngine } from '@amplitude/experiment-core';
import { Targeting as AmplitudeTargeting, TargetingParameters } from './typings/targeting';

export class Targeting implements AmplitudeTargeting {
  evaluationEngine: EvaluationEngine;

  constructor() {
    this.evaluationEngine = new EvaluationEngine();
  }

  evaluateTargeting = ({ event, sessionId, userProperties, deviceId, flag }: TargetingParameters) => {
    const context = {
      session_id: sessionId,
      event,
      user: {
        device_id: deviceId,
        user_properties: userProperties,
      },
    };
    return this.evaluationEngine.evaluate(context, [flag]);
  };
}
