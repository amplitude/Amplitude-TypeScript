import {
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  EventsStore,
  EventType,
  StoreType,
} from '../typings/session-replay';

import { SessionReplayJoinedConfig } from '../config/types';
import { getStorageSize } from '../helpers';
import { PayloadBatcher, SessionReplayTrackDestination } from '../track-destination';
import { SessionReplayEventsIDBStore } from './events-idb-store';
import { InMemoryEventsStore } from './events-memory-store';

export const createEventsManager = async <Type extends EventType>({
  config,
  sessionId,
  minInterval,
  maxInterval,
  type,
  payloadBatcher,
  storeType,
}: {
  config: SessionReplayJoinedConfig;
  type: Type;
  minInterval?: number;
  maxInterval?: number;
  sessionId?: string | number;
  payloadBatcher?: PayloadBatcher;
  storeType: StoreType;
}): Promise<AmplitudeSessionReplayEventsManager<Type, string>> => {
  const trackDestination = new SessionReplayTrackDestination({ loggerProvider: config.loggerProvider, payloadBatcher });

  const getMemoryStore = (): EventsStore<number> => {
    return new InMemoryEventsStore({
      loggerProvider: config.loggerProvider,
      maxInterval,
      minInterval,
    });
  };

  const getIdbStoreOrFallback = async (): Promise<EventsStore<number>> => {
    const store = await SessionReplayEventsIDBStore.new(
      type,
      {
        loggerProvider: config.loggerProvider,
        minInterval,
        maxInterval,
        apiKey: config.apiKey,
      },
      sessionId,
    );
    config.loggerProvider.log('Failed to initialize idb store, falling back to memory store.');
    return store ?? getMemoryStore();
  };

  const store: EventsStore<number> = storeType === 'idb' ? await getIdbStoreOrFallback() : getMemoryStore();

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
    sessionId: string | number;
    deviceId: string;
    customSessionId?: string;
    sequenceId?: number;
  }) => {
    if (config.debugMode) {
      getStorageSize()
        .then(({ totalStorageSize, percentOfQuota, usageDetails }) => {
          config.loggerProvider.debug(
            `Total storage size: ${totalStorageSize} KB, percentage of quota: ${percentOfQuota}%, usage details: ${usageDetails}`,
          );
        })
        .catch(() => {
          // swallow error
        });
    }

    trackDestination.sendEventsList({
      events: events,
      sessionId: sessionId,
      flushMaxRetries: config.flushMaxRetries,
      apiKey: config.apiKey,
      deviceId: deviceId,
      sampleRate: config.sampleRate,
      serverZone: config.serverZone,
      version: config.version,
      type,
      onComplete: async () => {
        await store.cleanUpSessionEventsStore(sessionId, sequenceId);
        return;
      },
    });
  };

  const sendCurrentSequenceEvents = ({ sessionId, deviceId }: { sessionId: number; deviceId: string }) => {
    store
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
    const sequencesToSend = await store.getSequencesToSend();
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
    customSessionId: string | null;
  }) => {
    store
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
    return trackDestination.flush(useRetry);
  }

  return {
    sendCurrentSequenceEvents,
    addEvent,
    sendStoredEvents,
    flush,
  };
};
