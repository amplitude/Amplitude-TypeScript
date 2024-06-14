import { EvaluationEngine } from '@amplitude/experiment-core';
import { storeEventTypeForSession } from './targeting-idb-store';
import { Targeting as AmplitudeTargeting, TargetingParameters } from './typings/targeting';

export class Targeting implements AmplitudeTargeting {
  evaluationEngine: EvaluationEngine;

  constructor() {
    this.evaluationEngine = new EvaluationEngine();
  }

  evaluateTargeting = async ({
    apiKey,
    loggerProvider,
    event,
    sessionId,
    userProperties,
    deviceId,
    flag,
  }: TargetingParameters) => {
    const eventTypes =
      event &&
      (await storeEventTypeForSession({
        loggerProvider: loggerProvider,
        apiKey: apiKey,
        sessionId,
        eventType: event.event_type,
      }));
    const context = {
      session_id: sessionId,
      event,
      event_types: eventTypes && Array.from(eventTypes),
      user: {
        device_id: deviceId,
        user_properties: userProperties,
      },
    };
    return this.evaluationEngine.evaluate(context, [flag]);
  };
}
