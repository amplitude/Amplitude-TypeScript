/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ILogger } from '@amplitude/analytics-core';
import { SessionReplayLocalConfig } from '../src/config/local-config';
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
    drainForFallback: jest.fn(),
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
        { events: [mockEventString, oversizedEvent], sequenceId: 1, sessionId: 123 },
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
      // Valid event is still sent
      expect(mockSendEventsList).toHaveBeenCalledTimes(1);
      expect(mockSendEventsList).toHaveBeenCalledWith(expect.objectContaining({ events: [mockEventString] }));
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
      });
      // Use the real memory store so shouldSplitEventsList can trigger a split.
      // eventA must be large enough that eventA + eventB >= MAX_EVENT_LIST_SIZE (1_000_000).
      const eventA = 'a'.repeat(999_990);
      const eventB = JSON.stringify({ type: 3, timestamp: 2 });

      eventsManager.addEvent({ event: { type: 'replay', data: eventA }, sessionId: 123, deviceId: '1a2b3c' });
      // Force split: eventB pushes the batch over the 1 MB limit
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
      (mockIDBStore.drainForFallback as jest.Mock).mockResolvedValueOnce([
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

      expect(mockIDBStore.drainForFallback).not.toHaveBeenCalled();
    });

    test('new events after fallback go to in-memory store, not IDB', async () => {
      (mockIDBStore.drainForFallback as jest.Mock).mockResolvedValueOnce([]);
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
      (mockIDBStore.drainForFallback as jest.Mock).mockResolvedValue([]);
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

    test('events added during drain go to memory store, not the broken IDB handle (SR-4356)', async () => {
      // The pre-fix recovery path awaited `store.getSequencesToSend()` on the
      // broken IDB handle BEFORE swapping `store` to the memory store, so any
      // addEvent calls in the await window still hit IDB.  The fix swaps
      // synchronously; this test pins that ordering by holding the drain on a
      // controllable promise and asserting subsequent addEvents don't touch
      // the IDB mock.
      let resolveDrain: (v: never[]) => void = () => undefined;
      const drainPromise = new Promise<never[]>((resolve) => {
        resolveDrain = resolve;
      });
      (mockIDBStore.drainForFallback as jest.Mock).mockReturnValueOnce(drainPromise);
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockResolvedValue(undefined);

      const eventsManager = await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      // Establish lastKnownDeviceId so switchToMemoryStore attempts a drain.
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve();

      // Reset IDB mock to count post-fallback calls only.
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockClear();

      // Trigger fallback.  switchToMemoryStore must swap synchronously and
      // then await the drain — which is still pending.
      capturedOnPersistentFailure?.();
      // Yield to let the synchronous swap settle.
      await Promise.resolve();

      // While drain is still in flight, push more events.  These must NOT hit
      // the IDB mock (proves the swap happened before the await).
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve();

      expect(mockIDBStore.addEventToCurrentSequence).not.toHaveBeenCalled();

      // Releasing the drain shouldn't change anything — events are already in memory.
      resolveDrain([]);
      await Promise.resolve();
      expect(mockIDBStore.addEventToCurrentSequence).not.toHaveBeenCalled();
    });

    test('drain rejection is swallowed and does not block fallback', async () => {
      // Defence in depth: even if the broken IDB rejects the drain (rather
      // than returning undefined via the tripped short-circuit), the recovery
      // path must accept the loss and keep recording in memory.
      (mockIDBStore.drainForFallback as jest.Mock).mockRejectedValueOnce(new Error('idb is gone'));
      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockResolvedValue(undefined);

      const eventsManager = await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'idb' });
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve();

      const beforeCalls = (mockIDBStore.addEventToCurrentSequence as jest.Mock).mock.calls.length;

      capturedOnPersistentFailure?.();
      await Promise.resolve();
      await Promise.resolve();

      // Recording continues — new events land on the memory store, not IDB.
      eventsManager.addEvent({ event: { type: 'replay', data: mockEventString }, sessionId: 123, deviceId: '1a2b3c' });
      await Promise.resolve();
      expect((mockIDBStore.addEventToCurrentSequence as jest.Mock).mock.calls.length).toBe(beforeCalls);
    });
  });
});
