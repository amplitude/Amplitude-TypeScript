/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@amplitude/analytics-types';
import { SessionReplayLocalConfig } from '../src/config/local-config';
import * as SessionReplayIDB from '../src/events/events-idb-store';
import { createEventsManager } from '../src/events/events-manager';
import { SessionReplayTrackDestination } from '../src/track-destination';

jest.mock('idb-keyval');
jest.mock('../src/track-destination');

type MockedLogger = jest.Mocked<Logger>;

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
    cleanUpSessionEventsStore: jest.fn(),
    addEventToCurrentSequence: jest.fn(),
    initialize: jest.fn(),
    storeSendingEvents: jest.fn(),
  } as unknown as SessionReplayIDB.SessionReplayEventsIDBStore;
  beforeEach(() => {
    jest.spyOn(SessionReplayIDB, 'createEventsIDBStore').mockResolvedValue(mockIDBStore);
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
  describe('sendStoredEvents', () => {
    test('should read events from storage and send them', async () => {
      (mockIDBStore.getSequencesToSend as jest.Mock).mockResolvedValue([
        { events: [mockEventString], sequenceId: 1, sessionId: 123 },
      ]);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockSendEventsList).toHaveBeenCalledTimes(1);
      expect(mockSendEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [mockEventString],
          sequenceId: 1,
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
      });
      await eventsManager.sendStoredEvents({ deviceId: '1a2b3c' });
      jest.runAllTimers();
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const mockSendEventsList = trackDestinationInstance.sendEventsList;
      expect(mockSendEventsList).not.toHaveBeenCalled();
    });
  });

  describe('addEvent', () => {
    test('should store events in IDB and send any returned', async () => {
      const mockAddEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });

      (mockIDBStore.addEventToCurrentSequence as jest.Mock).mockReturnValue(mockAddEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
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
              sequenceId: 1,
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
    test('should store events in IDB and send any returned', async () => {
      const mockStoreEventPromise = Promise.resolve({ events: [mockEventString], sequenceId: 1, sessionId: 123 });
      (mockIDBStore.storeCurrentSequence as jest.Mock).mockReturnValue(mockStoreEventPromise);
      const eventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
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
              sequenceId: 1,
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
      });
      const trackDestinationInstance = (SessionReplayTrackDestination as jest.Mock).mock.instances[0];
      const flushMock = trackDestinationInstance.flush;

      await eventsManager.flush();
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(false);
    });
  });
});
