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

export type EventsManagerWithBeacon<Type extends EventType> = AmplitudeSessionReplayEventsManager<Type, string> & {
  /**
   * Returns current pending events (since last flush) for synchronous access on page exit.
   * Used to populate a sendBeacon payload when the page is unloading.
   */
  getBeaconEvents(): string[];
  trackDestination: SessionReplayTrackDestination;
};

export const createEventsManager = async <Type extends EventType>({
  config,
  minInterval,
  maxInterval,
  type,
  payloadBatcher,
  storeType,
  trackDestinationWorkerScript,
}: {
  config: SessionReplayJoinedConfig;
  type: Type;
  minInterval?: number;
  maxInterval?: number;
  payloadBatcher?: PayloadBatcher;
  storeType: StoreType;
  trackDestinationWorkerScript?: string;
}): Promise<EventsManagerWithBeacon<Type>> => {
  const trackDestination = new SessionReplayTrackDestination({
    ...config,
    loggerProvider: config.loggerProvider,
    payloadBatcher,
    workerScript: trackDestinationWorkerScript,
  });

  const getMemoryStore = (): EventsStore<number> => {
    return new InMemoryEventsStore({
      loggerProvider: config.loggerProvider,
      maxInterval,
      minInterval,
    });
  };

  let lastKnownDeviceId: string | undefined;
  let usingIdbStore = false;
  let store!: EventsStore<number>;

  const switchToMemoryStore = async () => {
    if (!usingIdbStore) return;
    usingIdbStore = false;
    config.loggerProvider.warn('IDB store is experiencing repeated failures; falling back to in-memory event store.');
    const sequences = lastKnownDeviceId ? await store.getSequencesToSend() : undefined;
    store = getMemoryStore();
    if (sequences && lastKnownDeviceId) {
      const deviceId = lastKnownDeviceId;
      sequences.forEach((seq) => {
        sendEventsList({ sequenceId: seq.sequenceId, events: seq.events, sessionId: seq.sessionId, deviceId });
      });
    }
  };

  const getIdbStoreOrFallback = async (): Promise<EventsStore<number>> => {
    const idb = await SessionReplayEventsIDBStore.new(type, {
      loggerProvider: config.loggerProvider,
      minInterval,
      maxInterval,
      apiKey: config.apiKey,
      onPersistentFailure: () => {
        void switchToMemoryStore();
      },
    });
    if (!idb) {
      config.loggerProvider.log('Failed to initialize idb store, falling back to memory store.');
      return getMemoryStore();
    }
    usingIdbStore = true;
    return idb;
  };

  store = storeType === 'idb' ? await getIdbStoreOrFallback() : getMemoryStore();

  // Beacon buffer: a sliding window of pending (unsent) event strings for synchronous
  // access on page exit. Uses an absolute index counter to correctly handle concurrent
  // async flushes without losing events added between the flush call and its resolution.
  const beaconBuffer: string[] = [];
  let beaconWindowStart = 0; // absolute index of the first element in beaconBuffer

  const advanceBeaconWindow = (upToAbsoluteIdx: number) => {
    if (upToAbsoluteIdx <= beaconWindowStart) return;
    const trimCount = Math.min(upToAbsoluteIdx - beaconWindowStart, beaconBuffer.length);
    if (trimCount > 0) {
      beaconBuffer.splice(0, trimCount);
      beaconWindowStart = upToAbsoluteIdx;
    }
  };

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
    lastKnownDeviceId = deviceId;
    // Snapshot the absolute end-index before the async store read so that any events
    // pushed after this point are NOT considered sent and remain in the beacon buffer.
    const snapshotAbsIdx = beaconWindowStart + beaconBuffer.length;
    store
      .storeCurrentSequence(sessionId)
      .then((currentSequence) => {
        if (currentSequence) {
          advanceBeaconWindow(snapshotAbsIdx);
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
    lastKnownDeviceId = deviceId;
    const sequencesToSend = await store.getSequencesToSend();
    if (sequencesToSend && sequencesToSend.length > 0) {
      config.loggerProvider.log(
        `[SR] Draining ${sequencesToSend.length} orphaned sequence(s) from previous session (crash-recovery path).`,
      );
    }
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
    lastKnownDeviceId = deviceId;
    // Record the absolute index of this event in the beacon buffer before the async
    // store operation. If a batch split occurs, we advance the window up to (but not
    // including) this event so that it starts the next pending window.
    const absIdx = beaconWindowStart + beaconBuffer.length;
    beaconBuffer.push(event.data);
    store
      .addEventToCurrentSequence(sessionId, event.data)
      .then((sequenceToSend) => {
        if (sequenceToSend) {
          // Events before absIdx belong to the split batch being sent; advance window.
          advanceBeaconWindow(absIdx);
          sendEventsList({
            sequenceId: sequenceToSend.sequenceId,
            events: sequenceToSend.events,
            sessionId: sequenceToSend.sessionId,
            deviceId,
          });
        }
      })
      .catch((e) => {
        config.loggerProvider.warn('Failed to add event to session replay capture:', e);
      });
  };

  async function flush(useRetry = false) {
    return trackDestination.flush(useRetry);
  }

  const getBeaconEvents = (): string[] => [...beaconBuffer];

  return {
    sendCurrentSequenceEvents,
    addEvent,
    sendStoredEvents,
    flush,
    getBeaconEvents,
    trackDestination,
  };
};
