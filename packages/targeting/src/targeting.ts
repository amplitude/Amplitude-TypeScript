import { EvaluationEngine } from '@amplitude/experiment-core';
import { targetingIDBStore } from './targeting-idb-store';
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
      event && event.time
        ? await targetingIDBStore.storeEventTypeForSession({
            loggerProvider: loggerProvider,
            apiKey: apiKey,
            sessionId,
            eventType: event.event_type,
            eventTime: event.time,
          })
        : undefined;

    const eventStrings = eventTypes && new Set(Object.keys(eventTypes));

    const context = {
      session_id: sessionId,
      event,
      event_types: eventStrings && Array.from(eventStrings),
      user: {
        device_id: deviceId,
        user_properties: userProperties,
      },
    };
    return this.evaluationEngine.evaluate(context, [flag]);
  };
}
