import { EvaluationEngine } from '@amplitude/experiment-core';
<<<<<<< HEAD
=======
import { targetingIDBStore } from './targeting-idb-store';
>>>>>>> 7ea29d5c (fix(targeting): keep track of open db instances and ensure deduplication of events)
import { Targeting as AmplitudeTargeting, TargetingParameters } from './typings/targeting';

export class Targeting implements AmplitudeTargeting {
  evaluationEngine: EvaluationEngine;

  constructor() {
    this.evaluationEngine = new EvaluationEngine();
  }

<<<<<<< HEAD
  evaluateTargeting({ event, sessionId, userProperties, deviceId, flag }: TargetingParameters) {
=======
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

>>>>>>> 7ea29d5c (fix(targeting): keep track of open db instances and ensure deduplication of events)
    const context = {
      session_id: sessionId,
      event,
      user: {
        device_id: deviceId,
        user_properties: userProperties,
      },
    };
    return this.evaluationEngine.evaluate(context, [flag]);
  }
}
