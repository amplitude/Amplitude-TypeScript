/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ILogger } from '@amplitude/analytics-core';
import { SessionReplayLocalConfig } from '../src/config/local-config';
import { MAX_EVENT_LIST_SIZE } from '../src/constants';
import * as SessionReplayIDB from '../src/events/events-idb-store';
import { createEventsManager } from '../src/events/events-manager';
import { SessionReplayTrackDestination } from '../src/track-destination';
import * as helpers from '../src/helpers';

jest.mock('idb-keyval');
jest.mock('../src/track-destination');

type MockedLogger = jest.Mocked<ILogger>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

describe('createEventsManager', () => {
  let originalFetch: typeof global.fetch;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const config = new SessionReplayLocalConfig('static_key', {
    loggerProvider: mockLoggerProvider,
    sampleRate: 1,
  });
  const mockIDBStore = {
    storeCurrentSequence: jest.fn(),
    getSequencesToSend: jest.fn(),
    cleanUpSessionEventsStore: jest.fn().mockResolvedValue(undefined),
    addEventToCurrentSequence: jest.fn(),
    initialize: jest.fn(),
    storeSendingEvents: jest.fn(),
  } as unknown as SessionReplayIDB.SessionReplayEventsIDBStore;
  beforeEach(() => {
    jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new').mockResolvedValue(mockIDBStore);
    (mockIDBStore.cleanUpSessionEventsStore as jest.Mock).mockResolvedValue(undefined);
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
  });
  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;

    jest.useRealTimers();
  });

  test('falls back to memory store when IDB store fails to initialize', async () => {
    jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new').mockResolvedValue(undefined);

    await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'idb',
    });

    expect(mockLoggerProvider.log).toHaveBeenCalledWith(
      'Failed to initialize idb store, falling back to memory store.',
    );
  });

  test('does not log fallback message when IDB store initializes successfully', async () => {
    await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'idb',
    });

    expect(mockLoggerProvider.log).not.toHaveBeenCalledWith(
      'Failed to initialize idb store, falling back to memory store.',
    );
  });

  describe('sendStoredEvents', () => {
    test('should read events from storage and send them', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockSendEventsList).toHaveBeenCalledTimes(1);
      expect(mockSendEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [mockEventString],
          sessionId: 123,
          apiKey: 'static_key',
          deviceId: '1a2b3c',
          flushMaxRetries: 2,
          onComplete: expect.any(Function),
          sampleRate: 1,
          serverZone: 'US',
        }),
      );
    });

    test('should not send if no events', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue(undefined);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockSendEventsList).not.toHaveBeenCalled();
    });

    test('should log drain message when stored sequences are found', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
        { events: [mockEventString], sequenceId: 2, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      expect(mockLoggerProvider.log).toHaveBeenCalledWith('Draining 2 stored sequence(s) from previous session.');
    });

    test('coalesces the page-load backlog drain when more than one sequence is stored', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
        { events: [mockEventString], sequenceId: 2, sessionId: 123 },
        { events: [mockEventString], sequenceId: 3, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      // The drain marks the imminent flush to coalesce, then enqueues every sequence so the
      // backlog flushes as fewer POSTs (SR-4660) instead of one request per stored sequence.
      expect(trackDestinationInstance.markCoalesceNextFlush).toHaveBeenCalledTimes(1);
      expect(trackDestinationInstance.sendEventsList).toHaveBeenCalledTimes(3);
    });

    test('does not coalesce when only a single sequence is stored (nothing to merge)', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      expect(trackDestinationInstance.markCoalesceNextFlush).not.toHaveBeenCalled();
      expect(trackDestinationInstance.sendEventsList).toHaveBeenCalledTimes(1);
    });

    test('should not log drain message when sequences are empty', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      mockLoggerProvider.log.mockClear();
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      expect(mockLoggerProvider.log).not.toHaveBeenCalledWith(expect.stringContaining('Draining'));
    });

    test('should not log drain message when sequences is null', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue(null);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      mockLoggerProvider.log.mockClear();
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      expect(mockLoggerProvider.log).not.toHaveBeenCalledWith(expect.stringContaining('Draining'));
    });

    test('should log the current storage size', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      const getStoragePromise = Promise.resolve({
        percentOfQuota: 10,
        totalStorageSize: 100000,
        usageDetails: JSON.stringify({
          indexedDB: 10,
        }),
      });
      jest.spyOn(helpers, 'getStorageSize').mockImplementation(() => getStoragePromise);
      const eventsManager = await createEventsManager<'replay'>({
        config: {
          ...config,
          optOut: false,
          debugMode: true,
        },
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      await getStoragePromise;
      expect(mockLoggerProvider.debug).toHaveBeenCalled();
    });

    test('should handle an error in logging the current storage size', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      const getStoragePromise = Promise.resolve({
        percentOfQuota: 10,
        totalStorageSize: 100000,
        usageDetails: JSON.stringify({
          indexedDB: 10,
        }),
      });
      jest.spyOn(helpers, 'getStorageSize').mockImplementation(() => getStoragePromise);
      jest.spyOn(mockLoggerProvider, 'debug').mockImplementation(() => {
        throw new Error();
      });
      const eventsManager = await createEventsManager<'replay'>({
        config: {
          ...config,
          optOut: false,
          debugMode: true,
        },
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      await getStoragePromise;
      expect(mockLoggerProvider.debug).toHaveBeenCalled();
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockSendEventsList).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendEventsList — oversized event guard', () => {
    const oversizedEvent = 'x'.repeat(9 * 1000 * 1000 + 1);

    test('drops oversized events and warns before sending the rest', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString, oversizedEvent, mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();

      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('oversized'));
      // Events on both sides of the dropped one are still sent, in order.
      expect(mockSendEventsList).toHaveBeenCalledTimes(1);
      expect(mockSendEventsList).toHaveBeenCalledWith(
        expect.objectContaining({ events: [mockEventString, mockEventString] }),
      );
    });

    test('skips send and calls cleanUpSessionEventsStore when all events are oversized', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [oversizedEvent], sequenceId: 7, sessionId: 456 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();

      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockSendEventsList).not.toHaveBeenCalled();
      expect(mockIDBStore.cleanUpSessionEventsStore).toHaveBeenCalledWith(456, 7);
    });

    test('warns when cleanUpSessionEventsStore rejects after dropping all oversized events', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [oversizedEvent], sequenceId: 7, sessionId: 456 },
      ]);
      const cleanUpError = new Error('idb cleanup failed');
      (mockIDBStore.cleanUpSessionEventsStore as jest.Mock).mockRejectedValueOnce(cleanUpError);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Failed to clean up session replay events store:',
        cleanUpError,
      );
    });

    test('uses a lowered maxSingleEventSizeBytes as the pre-send drop threshold', async () => {
      const smallCapConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        maxSingleEventSizeBytes: 1_000,
      });
      // ~2 KB event: under the 9 MB default but over the 1 KB override.
      const mediumEvent = 'y'.repeat(2_000);
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString, mediumEvent], sequenceId: 1, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config: smallCapConfig,
        type: 'replay',
        storeType: 'idb',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();

      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('oversized'));
      expect(mockSendEventsList).toHaveBeenCalledWith(expect.objectContaining({ events: [mockEventString] }));
    });
  });

  describe('addEvent', () => {
    test('should store events in IDB and send any returned', async () => {
      const mockAddEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });

      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockReturnValue(mockAddEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      jest.runAllTimers();
      return mockAddEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          expect(mockIDBStore.addEventToCurrentSequence).toHaveBeenCalledWith(123, mockEventString);
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          const mockSendEventsList = trackDestinationInstance.sendEventsList;
          expect(mockSendEventsList).toHaveBeenCalledTimes(1);
          expect(mockSendEventsList).toHaveBeenCalledWith(
            expect.objectContaining({
              events: [mockEventString],
              sessionId: 123,
              apiKey: 'static_key',
              deviceId: '1a2b3c',
              flushMaxRetries: 2,
              onComplete: expect.any(Function),
              sampleRate: 1,
              serverZone: 'US',
            }),
          );
        });
    });
    test('should store events in IDB and not send any if none returned', async () => {
      const mockAddEventPromise = Promise.resolve();

      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockReturnValue(mockAddEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      jest.runAllTimers();
      return mockAddEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          expect(mockIDBStore.addEventToCurrentSequence).toHaveBeenCalledWith(123, mockEventString);
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          const mockSendEventsList = trackDestinationInstance.sendEventsList;
          expect(mockSendEventsList).not.toHaveBeenCalled();
        });
    });
    test('should catch errors', async () => {
      const mockAddEventPromise = Promise.reject('error');
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockImplementation(() => Promise.reject('error'));
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });

      return mockAddEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          expect(mockLoggerProvider.warn).toHaveBeenCalled();
        });
    });
  });

  describe('sendCurrentSequenceEvents', () => {
    test('todo no sequence', async () => {
      const mockStoreEventPromise = Promise.resolve({ events: [mockEventString], sessionId: 123 });
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockReturnValue(mockStoreEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.sendCurrentSequenceEvents({ sessionId: 123, deviceId: '1a2b3c' });
      jest.runAllTimers();
      return mockStoreEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          expect(mockIDBStore.storeCurrentSequence).toHaveBeenCalledWith(123);
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          const mockSendEventsList = trackDestinationInstance.sendEventsList;
          expect(mockSendEventsList).toHaveBeenCalledTimes(1);
          expect(mockSendEventsList).toHaveBeenCalledWith(
            expect.objectContaining({
              events: [mockEventString],
              sessionId: 123,
              apiKey: 'static_key',
              deviceId: '1a2b3c',
              flushMaxRetries: 2,
              onComplete: expect.any(Function),
              sampleRate: 1,
              serverZone: 'US',
            }),
          );
        });
    });

    test('should store events in IDB and send any returned', async () => {
      const mockStoreEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockReturnValue(mockStoreEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.sendCurrentSequenceEvents({ sessionId: 123, deviceId: '1a2b3c' });
      jest.runAllTimers();
      return mockStoreEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          expect(mockIDBStore.storeCurrentSequence).toHaveBeenCalledWith(123);
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          const mockSendEventsList = trackDestinationInstance.sendEventsList;
          expect(mockSendEventsList).toHaveBeenCalledTimes(1);
          expect(mockSendEventsList).toHaveBeenCalledWith(
            expect.objectContaining({
              events: [mockEventString],
              sessionId: 123,
              apiKey: 'static_key',
              deviceId: '1a2b3c',
              flushMaxRetries: 2,
              onComplete: expect.any(Function),
              sampleRate: 1,
              serverZone: 'US',
            }),
          );
        });
    });
    test('should update IDB store upon success', async () => {
      const mockStoreEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockReturnValue(mockStoreEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.sendCurrentSequenceEvents({ sessionId: 123, deviceId: '1a2b3c' });

      return mockStoreEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          const mockOnComplete = trackDestinationInstance.sendEventsList.mock.calls[0][0].onComplete;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          void mockOnComplete(123);
          expect(mockIDBStore.cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
        });
    });
    test('should catch errors', async () => {
      const mockStoreEventPromise = Promise.reject('error');
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockImplementation(() => Promise.reject('error'));
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.sendCurrentSequenceEvents({ sessionId: 123, deviceId: '1a2b3c' });

      return mockStoreEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          expect(mockLoggerProvider.warn).toHaveBeenCalled();
        });
    });
  });

  describe('getSendDecision callback', () => {
    test('should block sendEventsList in addEvent when the decision is hold', async () => {
      const mockAddEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockReturnValue(mockAddEventPromise);
      const getSendDecision = jest.fn().mockReturnValue('hold');
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
        getSendDecision,
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      // The decision must be made synchronously (before the async store resolves), for
      // the batch's own session.
      expect(getSendDecision).toHaveBeenCalledTimes(1);
      expect(getSendDecision).toHaveBeenCalledWith(123);
      jest.runAllTimers();
      return mockAddEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          expect(trackDestinationInstance.sendEventsList).not.toHaveBeenCalled();
          // Split events were atomically moved to sequencesToSend by the store; if we don't
          // clean them up they'd be unconditionally replayed via sendStoredEvents on next load.
          expect(mockIDBStore.cleanUpSessionEventsStore).toHaveBeenCalledWith(123, 1);
          // The held batch stays in the beacon buffer (the page-leave beacon is gated on the
          // same threshold, and a session change drops the buffer).
          expect(eventsManager.getBeaconEvents()).toEqual([mockEventString]);
        });
    });

    test('should log warning when cleanUpSessionEventsStore rejects on a gated split', async () => {
      const mockAddEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockReturnValue(mockAddEventPromise);
      (mockIDBStore.cleanUpSessionEventsStore as jest.Mock).mockRejectedValueOnce(new Error('idb gone'));
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
        getSendDecision: () => 'hold',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      // Let the addEvent .then() chain and the cleanUp .catch() chain both settle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Failed to clean up gated session replay sequence:',
        expect.any(Error),
      );
    });

    test('should block sendEventsList in sendCurrentSequenceEvents when the decision is hold', async () => {
      const mockStoreEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockReturnValue(mockStoreEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
        getSendDecision: () => 'hold',
      });
      eventsManager.sendCurrentSequenceEvents({ sessionId: 123, deviceId: '1a2b3c' });
      // The decision is made synchronously — storeCurrentSequence must not be called at all.
      expect(mockIDBStore.storeCurrentSequence).not.toHaveBeenCalled();
      jest.runAllTimers();
      await mockStoreEventPromise;
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      expect(trackDestinationInstance.sendEventsList).not.toHaveBeenCalled();
    });

    test('should allow sendEventsList when the decision is send', async () => {
      const mockAddEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockReturnValue(mockAddEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
        getSendDecision: () => 'send',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      jest.runAllTimers();
      return mockAddEventPromise
        .catch(() => {
          // ignore
        })
        .finally(() => {
          const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
          expect(trackDestinationInstance.sendEventsList).toHaveBeenCalledTimes(1);
        });
    });
  });

  describe('flush', () => {
    test('should call track destination flush with useRetry as true', async () => {
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const flushMock = trackDestinationInstance.flush;

      await eventsManager.flush(true);
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(true);
    });
    test('should call track destination flush without useRetry', async () => {
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const flushMock = trackDestinationInstance.flush;

      await eventsManager.flush();
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(false);
    });
  });

  describe('getBeaconEvents', () => {
    test('should return empty array initially', async () => {
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'memory',
      });
      expect(eventsManager.getBeaconEvents()).toEqual([]);
    });

    test('should accumulate events as they are added', async () => {
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'memory',
      });
      const eventA = JSON.stringify({ type: 3, timestamp: 1 });
      const eventB = JSON.stringify({ type: 3, timestamp: 2 });

      eventsManager.addEvent({ event: { type: 'replay', data: eventA }, sessionId: 123, deviceId: '1a2b3c' });
      eventsManager.addEvent({ event: { type: 'replay', data: eventB }, sessionId: 123, deviceId: '1a2b3c' });

      expect(eventsManager.getBeaconEvents()).toEqual([eventA, eventB]);
    });

    test('should advance window when sendCurrentSequenceEvents finalises events', async () => {
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockResolvedValue(undefined);
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockResolvedValue({
        sequenceId: 0,
        events: [mockEventString],
        sessionId: 123,
      });
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'idb',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve(); // let the addEvent async chain settle
      expect(eventsManager.getBeaconEvents()).toEqual([mockEventString]);

      eventsManager.sendCurrentSequenceEvents({ sessionId: 123, deviceId: '1a2b3c' });
      await (mockIDBStore.storeCurrentSequence as jest.Mock).mock.results[0].value;

      expect(eventsManager.getBeaconEvents()).toEqual([]);
    });

    test('should advance window on batch split and keep only current event', async () => {
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'memory',
        // Pin the split cap so the test controls the threshold rather than relying on the
        // SDK default (now 6 MB via DEFAULT_MAX_PERSISTED_EVENTS_SIZE_BYTES).
        maxPersistedEventsSize: MAX_EVENT_LIST_SIZE,
      });
      // Use the real memory store so shouldSplitEventsList can trigger a split.
      // eventA sits just under the cap so it doesn't split on its own; eventB then pushes the
      // batch over MAX_EVENT_LIST_SIZE. Derived from the constant so it tracks cap changes.
      // 10 bytes of slack exceeds getEventsArraySize's 4-byte overhead for a 1-event list
      // (2 + 0 + 2) plus eventB's payload, so eventA stays under the cap alone but crosses
      // it once eventB is appended.
      const eventA = 'a'.repeat(MAX_EVENT_LIST_SIZE - 10);
      const eventB = JSON.stringify({ type: 3, timestamp: 2 });

      eventsManager.addEvent({ event: { type: 'replay', data: eventA }, sessionId: 123, deviceId: '1a2b3c' });
      // Force split: eventB pushes the batch over the MAX_EVENT_LIST_SIZE limit
      eventsManager.addEvent({ event: { type: 'replay', data: eventB }, sessionId: 123, deviceId: '1a2b3c' });

      // Let the async addEventToCurrentSequence chains settle (two microtask ticks).
      await Promise.resolve();
      await Promise.resolve();

      expect(eventsManager.getBeaconEvents()).toEqual([eventB]);
    });

    test('should return a copy of the buffer (mutation-safe)', async () => {
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'memory',
      });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      const snapshot = eventsManager.getBeaconEvents();
      snapshot.push('extra');
      expect(eventsManager.getBeaconEvents()).toHaveLength(1);
    });
  });

  describe('dropPendingBeaconEvents', () => {
    test('should clear the buffer and not affect later events added under a new session', async () => {
      const eventsManager = await createEventsManager({
        config,
        type: 'replay',
        storeType: 'memory',
      });
      const oldEvent = JSON.stringify({ type: 3, timestamp: 1 });
      const newEvent = JSON.stringify({ type: 3, timestamp: 2 });
      eventsManager.addEvent({ event: { type: 'replay', data: oldEvent }, sessionId: 1, deviceId: '1a2b3c' });
      expect(eventsManager.getBeaconEvents()).toEqual([oldEvent]);

      eventsManager.dropPendingBeaconEvents();
      expect(eventsManager.getBeaconEvents()).toEqual([]);

      // Subsequent events from a new session must accumulate cleanly without the dropped events.
      eventsManager.addEvent({ event: { type: 'replay', data: newEvent }, sessionId: 2, deviceId: '1a2b3c' });
      expect(eventsManager.getBeaconEvents()).toEqual([newEvent]);
    });
  });

  describe('mid-session IDB fallback', () => {
    let capturedOnPersistentFailure: (() => void) | undefined;

    beforeEach(() => {
      capturedOnPersistentFailure = undefined;
      jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new').mockImplementation((_type, args) => {
        capturedOnPersistentFailure = (args as { onPersistentFailure?: () => void }).onPersistentFailure;
        return Promise.resolve(mockIDBStore);
      });
    });

    test('logs warning when falling back to in-memory store', async () => {
      await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });

      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'IDB store is experiencing repeated failures; falling back to in-memory event store.',
      );
    });

    test('drains and sends pending IDB sequences when falling back', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValueOnce([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockResolvedValue(undefined);

      const eventsManager = await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });

      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve();

      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      expect(trackDestinationInstance.sendEventsList).toHaveBeenCalledWith(
        expect.objectContaining({ events: [mockEventString], sessionId: 123, deviceId: '1a2b3c' }),
      );
    });

    test('skips IDB drain when no deviceId is known yet', async () => {
      await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      // no addEvent / sendStoredEvents call, so lastKnownDeviceId is still undefined

      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockIDBStore.getSequencesToSend).not.toHaveBeenCalled();
    });

    test('new events after fallback go to in-memory store, not IDB', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValueOnce([]);
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockResolvedValue(undefined);

      const eventsManager = await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      // Establish lastKnownDeviceId
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve();

      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve(); // switchToMemoryStore settles

      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockClear();

      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve();

      expect(mockIDBStore.addEventToCurrentSequence).not.toHaveBeenCalled();
    });

    test('fallback is a no-op when store is already in-memory (startup fallback)', async () => {
      jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new').mockResolvedValueOnce(undefined);

      await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      // capturedOnPersistentFailure is undefined here since IDB.new returned undefined (startup fallback)
      // Simulate calling it anyway to confirm no error / double-warn
      capturedOnPersistentFailure?.();

      // Only the startup fallback log should appear, not the mid-session warn
      expect(mockLoggerProvider.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('IDB store is experiencing repeated failures'),
      );
    });

    test('second switchToMemoryStore call is a no-op (already on memory)', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([]);
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockResolvedValue(undefined);

      const eventsManager = await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });

      // First trigger — switches to memory store
      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve();

      // Second trigger — should be a no-op (usingIdbStore is already false)
      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve();

      // Warning should only be logged once
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createEventsManager min session duration gate (in-memory store)', () => {
  const START = 1_000_000;
  const loggerProvider = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const config = new SessionReplayLocalConfig('static_key', { loggerProvider, sampleRate: 1 });

  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  // Uses the real InMemoryEventsStore so its time-based batch splitting actually happens
  // while the gate is closed (the IDB-mocked tests above can't exercise that). The decision
  // function mirrors SessionReplay.getSendDecision: the current session is held until its
  // gate opens; a past session is dropped or sent by the verdict recorded when it ended.
  const setup = async () => {
    let currentSessionId = 123;
    let gateOpen = false;
    const pastVerdicts = new Map<number, boolean>();
    const eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
      getSendDecision: (sessionId) => {
        if (sessionId === currentSessionId) return gateOpen ? 'send' : 'hold';
        return pastVerdicts.get(sessionId) === false ? 'drop' : 'send';
      },
    });
    const trackDestination = (SessionReplayTrackDestination as jest.Mock).mock.instances.slice(-1)[0];
    const calls = () =>
      (trackDestination.sendEventsList as jest.Mock).mock.calls.map(
        (call: [{ events: string[]; sessionId: string | number }]) => call[0],
      );
    const add = async (data: string, atMs: number, sessionId = currentSessionId) => {
      jest.setSystemTime(START + atMs);
      eventsManager.addEvent({ event: { type: 'replay', data }, sessionId, deviceId: 'd' });
      await settle();
    };
    const send = async (sessionId = currentSessionId) => {
      eventsManager.sendCurrentSequenceEvents({ sessionId, deviceId: 'd' });
      await settle();
    };
    // Ten seconds of gated activity: enough for the store to split several times.
    const recordGatedSession = async () => {
      await add('full-snapshot', 0);
      for (let s = 1; s <= 10; s++) await add(`inc-${s}`, s * 1000);
    };
    return {
      eventsManager,
      add,
      send,
      recordGatedSession,
      sent: () => calls().flatMap((c) => c.events),
      sentSessionIds: () => calls().map((c) => c.sessionId),
      openGate: () => {
        gateOpen = true;
      },
      // Session change: record the outgoing session's verdict, close the gate for the new one.
      changeSession: (nextSessionId: number) => {
        pastVerdicts.set(currentSessionId, gateOpen);
        currentSessionId = nextSessionId;
        gateOpen = false;
      },
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const ALL_EVENTS = ['full-snapshot', ...Array.from({ length: 10 }, (_, i) => `inc-${i + 1}`)];

  test('sends nothing while the gate is closed', async () => {
    const { recordGatedSession, send, sent } = await setup();
    await recordGatedSession();
    await send();
    expect(sent()).toEqual([]);
  });

  test('sends every held batch, in order, when sendCurrentSequenceEvents passes the gate', async () => {
    const { recordGatedSession, send, openGate, sent } = await setup();
    await recordGatedSession();
    openGate();
    await send();
    // Before the fix only the last un-split batch was sent and the full snapshot was lost.
    expect(sent()).toEqual(ALL_EVENTS);
  });

  test('sends held batches ahead of new events when the first event after the gate is recorded', async () => {
    const { recordGatedSession, add, openGate, sent } = await setup();
    await recordGatedSession();
    openGate();
    // Long enough after the last split that this event splits off the current sequence.
    await add('after-gate', 30_000);
    expect(sent()[0]).toBe('full-snapshot');
    expect(sent()).toEqual(ALL_EVENTS);
  });

  test('releases held batches only once', async () => {
    const { recordGatedSession, add, send, openGate, sent } = await setup();
    await recordGatedSession();
    openGate();
    await send();
    await add('later', 60_000);
    await send();
    expect(sent().filter((e) => e === 'full-snapshot')).toHaveLength(1);
  });

  test('discards held batches of a session that ended below the threshold', async () => {
    const { recordGatedSession, add, send, openGate, changeSession, sent, sentSessionIds } = await setup();
    await recordGatedSession();
    changeSession(222);
    await add('s2-full-snapshot', 20_000);
    await add('s2-inc', 21_000);
    openGate();
    await send();
    // A late event for the short session must not release (or resurrect) its batches.
    await add('s1-late', 40_000, 123);
    await send(123);
    expect(sentSessionIds().every((id) => id === 222)).toBe(true);
    expect(sent()).not.toContain('full-snapshot');
    expect(sent()).not.toContain('s1-late');
    expect(sent()[0]).toBe('s2-full-snapshot');
  });

  test('sends held batches of the previous session when it passed before the session changed', async () => {
    const { recordGatedSession, send, openGate, changeSession, sent } = await setup();
    await recordGatedSession();
    openGate();
    // Mirrors asyncSetSessionId: sendEvents(previous) runs before the session switches.
    send(123).catch(() => undefined);
    changeSession(222);
    await settle();
    expect(sent()).toEqual(ALL_EVENTS);
  });

  test('a late split from the previous session does not discard the current session’s held batches', async () => {
    const { add, send, openGate, changeSession, sent } = await setup();
    // Session 123 has an open (unsplit) sequence when the session changes.
    await add('s1-event', 0);
    changeSession(222);
    // Session 222 holds its baseline while gated.
    await add('s2-full-snapshot', 1000);
    await add('s2-inc-1', 2000);
    await add('s2-inc-2', 3000);
    // A compression-worker callback for session 123 lands late and splits its sequence.
    await add('s1-late', 10_000, 123);
    // ...and another late one for 123 after 222 has passed its gate.
    openGate();
    await add('s1-later', 20_000, 123);
    await send();
    expect(sent()).toEqual(['s2-full-snapshot', 's2-inc-1', 's2-inc-2']);
  });

  test('keeps held batches for at most two sessions, evicting the oldest', async () => {
    // Defensive cap, independent of the decision function: hold for three sessions at once.
    let gateOpen = false;
    const eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
      getSendDecision: () => (gateOpen ? 'send' : 'hold'),
    });
    const trackDestination = (SessionReplayTrackDestination as jest.Mock).mock.instances.slice(-1)[0];
    for (const [i, sessionId] of [111, 222, 333].entries()) {
      for (const [j, data] of ['full-snapshot', 'inc'].entries()) {
        jest.setSystemTime(START + i * 10_000 + j * 1000);
        eventsManager.addEvent({ event: { type: 'replay', data: `${sessionId}-${data}` }, sessionId, deviceId: 'd' });
        await settle();
      }
    }
    gateOpen = true;
    for (const sessionId of [111, 222, 333]) {
      eventsManager.sendCurrentSequenceEvents({ sessionId, deviceId: 'd' });
      await settle();
    }
    const sent = (trackDestination.sendEventsList as jest.Mock).mock.calls.flatMap(
      (call: [{ events: string[] }]) => call[0].events,
    );
    expect(sent).not.toContain('111-full-snapshot');
    expect(sent).toContain('222-full-snapshot');
    expect(sent).toContain('333-full-snapshot');
  });

  test('keeps held batches at the front of the beacon buffer until they are released', async () => {
    const { recordGatedSession, eventsManager } = await setup();
    await recordGatedSession();
    // Covers a session that passes the gate and closes before anything releases the held
    // batches (e.g. an idle background tab): the page-leave beacon still carries them.
    expect(eventsManager.getBeaconEvents()).toEqual(ALL_EVENTS);
  });

  test('removes released batches from the beacon buffer so the beacon does not resend them', async () => {
    const { recordGatedSession, add, eventsManager, openGate } = await setup();
    await recordGatedSession();
    openGate();
    await add('after-gate', 30_000);
    expect(eventsManager.getBeaconEvents()).not.toContain('full-snapshot');
    expect(eventsManager.getBeaconEvents()).toContain('after-gate');
  });

  test('does not hand held batches to sendStoredEvents', async () => {
    const { recordGatedSession, eventsManager, sent } = await setup();
    await recordGatedSession();
    await eventsManager.sendStoredEvents({ deviceId: 'd' });
    await settle();
    expect(sent()).toEqual([]);
  });
});
