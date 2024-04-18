import { SessionReplayEventsManager as AmplitudeSessionReplayEventsManager } from './typings/session-replay';

import { SessionReplayJoinedConfig } from './config/types';
import { createEventsIDBStore } from './events-idb-store';
import { SessionReplayTrackDestination } from './track-destination';

export const createEventsManager = async ({
  config,
}: {
  config: SessionReplayJoinedConfig;
}): Promise<AmplitudeSessionReplayEventsManager> => {
  const trackDestination = new SessionReplayTrackDestination({ loggerProvider: config.loggerProvider });

  const eventsIDBStore = await createEventsIDBStore({
    loggerProvider: config.loggerProvider,
    apiKey: config.apiKey,
  });

  const sendEventsList = ({
    events,
    sessionId,
    deviceId,
  }: {
    events: string[];
    sessionId: number;
    deviceId: string;
  }) => {
    eventsIDBStore
      .storeSendingEvents(sessionId, events)
      .then((sequenceId) => {
        trackDestination.sendEventsList({
          events: events,
          sequenceId: sequenceId || 0,
          sessionId: sessionId,
          flushMaxRetries: config.flushMaxRetries,
          apiKey: config.apiKey,
          deviceId: deviceId,
          sampleRate: config.sampleRate,
          serverZone: config.serverZone,
          onComplete: eventsIDBStore.cleanUpSessionEventsStore.bind(eventsIDBStore),
        });
      })
      .catch((e) => {
        config.loggerProvider.warn('Failed to store session replay events to send:', e);
      });
  };

  const sendEvents = ({ sessionId, deviceId }: { sessionId: number; deviceId: string }) => {
    eventsIDBStore
      .getCurrentSequenceForSession(sessionId)
      .then((eventsToSend) => {
        if (eventsToSend && eventsToSend.length && sessionId) {
          sendEventsList({
            events: eventsToSend,
            sessionId,
            deviceId,
          });
        }
      })
      .catch((e) => {
        config.loggerProvider.warn('Failed to get current sequence of session replay events for session:', e);
      });
  };

  const sendStoredEvents = async ({ deviceId }: { deviceId: string }) => {
    const unsentSequences = await eventsIDBStore.getUnsentSequences();
    unsentSequences?.forEach((sequence) => {
      sendEventsList({
        events: sequence.events,
        sessionId: sequence.sessionId,
        deviceId,
      });
    });
  };

  const addEvent = ({ event, sessionId, deviceId }: { event: string; sessionId: number; deviceId: string }) => {
    eventsIDBStore
      .addEventToSequence(sessionId, event)
      .then((eventsToSend) => {
        eventsToSend &&
          sendEventsList({
            events: eventsToSend,
            sessionId,
            deviceId,
          });
      })
      .catch((e) => {
        config.loggerProvider.warn('Failed to add event to session replay capture:', e);
      });
  };

  async function flush(useRetry = false) {
    if (trackDestination) {
      return trackDestination.flush(useRetry);
    }
  }

  return {
    sendEvents,
    addEvent,
    sendStoredEvents,
    flush,
  };
};
