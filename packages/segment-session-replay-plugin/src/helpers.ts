import * as sessionReplay from '@amplitude/session-replay-browser';
import { Context } from '@segment/analytics-next';
import Cookie from 'js-cookie';
import { COOKIE_NAME } from './constants';
import { AmplitudeIntegrationData } from './typings/wrapper';

export const getSessionId = (): number | undefined => {
  // First try to get the sessionId from the Session Replay SDK
  // If that fails, try to get the sessionId from the persistent storage
  const sessionId: string | number | undefined = sessionReplay.getSessionId() || Cookie.get(COOKIE_NAME);
  if (sessionId) {
    const result = parseInt(sessionId.toString(), 10);
    if (isNaN(result)) {
      return undefined;
    }
    return result;
  }

  // If sessionId is not found in either the Session Replay SDK nor persistent storage, return undefined
  return undefined;
};

export const setSessionId = (sessionId: number, deviceId: string | undefined): Promise<void> => {
  // Set the sessionId in the persistent storage
  Cookie.set(COOKIE_NAME, sessionId.toString());

  // Set the sessionId in the Session Replay SDK
  return sessionReplay.setSessionId(sessionId, deviceId).promise;
};

export const updateSessionIdAndAddProperties = async (ctx: Context, deviceId: string | undefined): Promise<Context> => {
  // Get the current session id or default to 0 if it does not exist
  const sessionId: number = getSessionId() || 0;

  // Get the next session id from the event, if it exists
  let nextSessionId: number | undefined;
  if (ctx.event.integrations && (ctx.event.integrations['Actions Amplitude'] as AmplitudeIntegrationData)) {
    nextSessionId = (ctx.event.integrations['Actions Amplitude'] as AmplitudeIntegrationData).session_id;
  }

  // Update the session id if it is new
  if (nextSessionId && sessionId < nextSessionId) {
    await setSessionId(nextSessionId, deviceId);
  }

  // Only evaluate targeting if the event belongs to the current session
  // Skip evaluation for delayed/offline events from older sessions
  const currentSessionId = getSessionId() || 0;
  const shouldEvaluateTargeting = !nextSessionId || nextSessionId === currentSessionId;

  if (shouldEvaluateTargeting) {
    // Convert Segment event to Amplitude event format for targeting evaluation
    const amplitudeEvent = {
      event_type: ctx.event.event || ctx.event.type || 'unknown',
      event_properties: ctx.event.properties || {},
      user_properties: ctx.event.traits || {},
      time: ctx.event.timestamp ? new Date(ctx.event.timestamp).getTime() : Date.now(),
    };

    // Evaluate targeting and capture decision before enriching with properties
    await sessionReplay.evaluateTargetingAndCapture({ event: amplitudeEvent });
  }

  // Enrich the event with the session replay properties
  // NOTE: This is what will add the `[Amplitude] Session Replay ID` attribute to the event
  const sessionReplayProperties = sessionReplay.getSessionReplayProperties();
  const properties = {
    ...sessionReplayProperties,
    ...ctx.event.properties,
  };

  ctx.updateEvent('properties', properties);

  return ctx;
};
