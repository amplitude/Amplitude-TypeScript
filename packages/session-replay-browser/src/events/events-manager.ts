import {
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  EventsStore,
  EventType,
  StoreType,
} from '../typings/session-replay';

import { SessionReplayJoinedConfig } from '../config/types';
import { MAX_SINGLE_EVENT_SIZE } from '../constants';
import { utf8ByteLengthIfOver } from '../utils/utf8-byte-length';
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
  /**
   * Drops all pending beacon events. Used when the session is decided to be below
   * the min duration threshold so its events don't leak into a later session's beacon.
   */
  dropPendingBeaconEvents(): void;
  trackDestination: SessionReplayTrackDestination;
};

export const createEventsManager = async <Type extends EventType>({
  config,
  minInterval,
  maxInterval,
  maxPersistedEventsSize,
  type,
  payloadBatcher,
  storeType,
  trackDestinationWorkerScript,
  shouldSend,
}: {
  config: SessionReplayJoinedConfig;
  type: Type;
  minInterval?: number;
  maxInterval?: number;
  maxPersistedEventsSize?: number;
  payloadBatcher?: PayloadBatcher;
  storeType: StoreType;
  trackDestinationWorkerScript?: string;
  shouldSend?: () => boolean;
}): Promise<EventsManagerWithBeacon<Type>> => {
  // Configurable per-single-event drop cap (defaults to MAX_SINGLE_EVENT_SIZE); enforced both
  // here as a pre-send backstop and at capture time in EventCompressor.
  const maxSingleEventSize = config.maxSingleEventSizeBytes ?? MAX_SINGLE_EVENT_SIZE;
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
      maxPersistedEventsSize,
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
      maxPersistedEventsSize,
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

  // Batches split off while the min-session-duration gate is closed. The store splits on a
  // timer (first split ~500ms in), so the first held batch carries the initial FullSnapshot;
  // dropping it leaves the uploaded replay with no baseline to render. They are kept here, in
  // memory only, rather than in the store, so sendStoredEvents can't replay them on a later
  // page load for a session that never passed the gate. Released in order once the same
  // session passes; batches from any other session are discarded.
  //
  // Held events also stay in the beacon buffer (they are its oldest entries, so the beacon's
  // prefix trim keeps them first). If the session passes the gate and the page closes before
  // anything releases them, e.g. an idle background tab, the page-leave beacon still carries
  // them. `beaconEndIdx` is the absolute beacon index just past the batch.
  let heldSequences: { sessionId: number; events: string[]; beaconEndIdx: number }[] = [];

  const holdSequence = (sessionId: number, events: string[], beaconEndIdx: number) => {
    heldSequences = heldSequences.filter((seq) => seq.sessionId === sessionId);
    heldSequences.push({ sessionId, events, beaconEndIdx });
  };

  /**
   * Immediately sends events to the track destination.
   */
  const sendEventsList = ({
    events: rawEvents,
    sessionId,
    deviceId,
    sequenceId,
  }: {
    events: string[];
    sessionId: string | number;
    deviceId: string;
    sequenceId?: number;
  }) => {
    // Backstop for events that entered IDB before the per-event size guard in
    // addCompressedEventToManager (e.g. stored by a previous SDK version or via
    // storeCurrentSequence/sendStoredEvents which bypass the capture-time check).
    // Compare UTF-8 byte size, not JS char count, to match the server-side limit.
    let events = rawEvents;
    const oversizedSizes: number[] = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const bytes = utf8ByteLengthIfOver(rawEvents[i], maxSingleEventSize);
      if (bytes === undefined) {
        if (events !== rawEvents) events.push(rawEvents[i]);
        continue;
      }
      if (oversizedSizes.length === 0) {
        events = rawEvents.slice(0, i);
      }
      oversizedSizes.push(bytes);
    }
    if (oversizedSizes.length > 0) {
      config.loggerProvider.warn(
        `Dropping ${
          oversizedSizes.length
        } oversized event(s) from session replay sequence before send. Sizes: ${oversizedSizes
          .map((bytes) => `${Math.round(bytes / 1024)} KB`)
          .join(
            ', ',
          )}. If this recurs, please open a GitHub issue at https://github.com/amplitude/Amplitude-TypeScript/issues or contact Amplitude support.`,
      );
    }
    if (events.length === 0) {
      store.cleanUpSessionEventsStore(sessionId, sequenceId).catch((e) => {
        config.loggerProvider.warn('Failed to clean up session replay events store:', e);
      });
      return;
    }

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

  const releaseHeldSequences = (sessionId: number, deviceId: string) => {
    if (!heldSequences.length) return;
    const held = heldSequences;
    heldSequences = [];
    held.forEach((seq) => {
      if (seq.sessionId !== sessionId) return;
      // No sequenceId: the store entry was already cleaned up when the batch was held.
      sendEventsList({ events: seq.events, sessionId, deviceId });
      advanceBeaconWindow(seq.beaconEndIdx);
    });
  };

  const sendCurrentSequenceEvents = ({ sessionId, deviceId }: { sessionId: number; deviceId: string }) => {
    lastKnownDeviceId = deviceId;
    // Evaluate shouldSend synchronously before the async store read. asyncSetSessionId
    // updates sessionStartTime immediately after calling sendEvents(), so by the time
    // storeCurrentSequence resolves the start time would reflect the new session and
    // the elapsed check would compute ~0ms, silently dropping the previous session's events.
    if (shouldSend && !shouldSend()) return;
    // Snapshot the absolute end-index before the async store read so that any events
    // pushed after this point are NOT considered sent and remain in the beacon buffer.
    const snapshotAbsIdx = beaconWindowStart + beaconBuffer.length;
    store
      .storeCurrentSequence(sessionId)
      .then((currentSequence) => {
        // Inside the .then so batches held by earlier, still-pending addEvent calls are
        // already in heldSequences, and they are queued ahead of the current sequence.
        releaseHeldSequences(sessionId, deviceId);
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
    if (!sequencesToSend?.length) {
      return;
    }
    config.loggerProvider.log(`Draining ${sequencesToSend.length} stored sequence(s) from previous session.`);
    // These persisted sequences are about to be enqueued back-to-back. Without
    // coalescing they flush as N separate POSTs — a request flood on page load. Mark the
    // imminent flush to merge same-identity batches (the enqueues below are synchronous, so
    // the whole backlog lands in the queue before the deferred flush consumes the flag). Skip
    // the single-sequence case where there's nothing to merge.
    if (sequencesToSend.length > 1) {
      trackDestination.markCoalesceNextFlush();
    }
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
    // Capture shouldSend synchronously before the async store write, for the same
    // reason as sendCurrentSequenceEvents: asyncSetSessionId updates sessionStartTime
    // synchronously, so evaluating inside the .then() would use the new session's
    // start time and compute ~0ms elapsed, silently dropping a valid batch.
    const canSend = !shouldSend || shouldSend();
    // Record the absolute index of this event in the beacon buffer before the async
    // store operation. If a batch split occurs, we advance the window up to (but not
    // including) this event so that it starts the next pending window.
    const absIdx = beaconWindowStart + beaconBuffer.length;
    beaconBuffer.push(event.data);
    store
      .addEventToCurrentSequence(sessionId, event.data)
      .then((sequenceToSend) => {
        if (canSend) {
          // First event recorded after the session passed the gate: send what was held
          // while it was closed, ahead of any batch split off by this event.
          releaseHeldSequences(sessionId, deviceId);
        }
        if (sequenceToSend) {
          if (!canSend) {
            // The split atomically moved events to sequencesToSend; without cleanup
            // they would be unconditionally replayed on next page load via
            // sendStoredEvents, bypassing the min session duration gate. Keep the
            // events in memory instead so they can still be sent if this session
            // passes the gate later. They stay in the beacon buffer: the page-leave
            // beacon is gated on the same threshold, and asyncSetSessionId drops the
            // buffer on a session change, so they can't leak into another session.
            store.cleanUpSessionEventsStore(sequenceToSend.sessionId, sequenceToSend.sequenceId).catch((e) => {
              config.loggerProvider.warn('Failed to clean up held session replay sequence:', e);
            });
            holdSequence(sessionId, sequenceToSend.events, absIdx);
            return;
          }
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

  const dropPendingBeaconEvents = () => {
    advanceBeaconWindow(beaconWindowStart + beaconBuffer.length);
  };

  return {
    sendCurrentSequenceEvents,
    addEvent,
    sendStoredEvents,
    flush,
    getBeaconEvents,
    dropPendingBeaconEvents,
    trackDestination,
  };
};
