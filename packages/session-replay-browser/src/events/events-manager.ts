import {
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  EventType,
} from '../typings/session-replay';

import { SessionReplayJoinedConfig } from '../config/types';
import { createEventsIDBStore } from './events-idb-store';

export const createEventsManager = async <Type extends EventType>({
  config,
  sessionId,
  minInterval,
  maxInterval,
  type,
  trackDestination,
}: {
  config: SessionReplayJoinedConfig;
  type: Type;
  minInterval?: number;
  maxInterval?: number;
  sessionId?: number;
  trackDestination: AmplitudeSessionReplayTrackDestination;
}): Promise<AmplitudeSessionReplayEventsManager<Type, string>> => {
  const eventsIDBStore = await createEventsIDBStore({
    loggerProvider: config.loggerProvider,
    apiKey: config.apiKey,
    sessionId,
    minInterval,
    maxInterval,
    type,
  });

  /**
   * Immediately sends events to the track destination.
   */
  const sendEventsList = ({
    events,
    sessionId,
    deviceId,
    sequenceId,
  }: {
    events: string[];
    sessionId: number;
    deviceId: string;
    sequenceId: number;
  }) => {
    trackDestination.sendEventsList({
      events: events,
      sequenceId: sequenceId,
      sessionId: sessionId,
      flushMaxRetries: config.flushMaxRetries,
      apiKey: config.apiKey,
      deviceId: deviceId,
      sampleRate: config.sampleRate,
      serverZone: config.serverZone,
      type,
      onComplete: eventsIDBStore.cleanUpSessionEventsStore.bind(eventsIDBStore),
    });
  };

  const sendCurrentSequenceEvents = ({ sessionId, deviceId }: { sessionId: number; deviceId: string }) => {
    eventsIDBStore
      .storeCurrentSequence(sessionId)
      .then((currentSequence) => {
        if (currentSequence) {
          sendEventsList({
            sequenceId: currentSequence.sequenceId,
            events: currentSequence.events,
            sessionId: currentSequence.sessionId,
            deviceId,
          });
        }
      })
      .catch((e) => {
        config.loggerProvider.warn('Failed to get current sequence of session replay events for session:', e);
      });
  };

  const sendStoredEvents = async ({ deviceId }: { deviceId: string }) => {
    const sequencesToSend = await eventsIDBStore.getSequencesToSend();
    sequencesToSend &&
      sequencesToSend.forEach((sequence) => {
        sendEventsList({
          sequenceId: sequence.sequenceId,
          events: sequence.events,
          sessionId: sequence.sessionId,
          deviceId,
        });
      });
  };

  const addEvent = ({
    event,
    sessionId,
    deviceId,
  }: {
    event: { type: Type; data: string };
    sessionId: number;
    deviceId: string;
  }) => {
    eventsIDBStore
      .addEventToCurrentSequence(sessionId, event.data)
      .then((sequenceToSend) => {
        return (
          sequenceToSend &&
          sendEventsList({
            sequenceId: sequenceToSend.sequenceId,
            events: sequenceToSend.events,
            sessionId: sequenceToSend.sessionId,
            deviceId,
          })
        );
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
    sendCurrentSequenceEvents,
    addEvent,
    sendStoredEvents,
    flush,
  };
};
