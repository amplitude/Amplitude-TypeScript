/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@amplitude/analytics-types';
import { SessionReplayRemoteConfig } from '../src/config/types';
import * as EventsIDBStore from '../src/events-idb-store';
import { SessionReplayEventsIDBStore } from '../src/events-idb-store';
import { IDBStore, SendingStatus } from '../src/typings/session-replay';

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';
const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

const samplingConfig = {
  sample_rate: 1,
  capture_enabled: true,
};
const mockRemoteConfig: SessionReplayRemoteConfig = {
  sr_sampling_config: samplingConfig,
};

describe('SessionReplayEventsIDBStore', () => {
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  // let putMock: jest.Mock;
  // let mockDB: IDBPDatabase<SessionReplayDB>;
  beforeEach(() => {
    // putMock = jest.fn();
    // mockDB = {
    //   get: jest.fn().mockImplementation(async (objectStoreName) => {
    //     if (objectStoreName === 'lastFetchedSessionId') {
    //       return 123;
    //     }
    //     return mockRemoteConfig;
    //   }),
    //   put: putMock,
    // } as unknown as IDBPDatabase<SessionReplayDB>;
    // jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValueOnce(mockDB);
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('initialize', () => {
    test('should create a store with a custom key', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      expect(EventsIDBStore.createStore).toHaveBeenCalledWith('static_key_amp_session_replay_events');
    });
    // test.skip('should transition from keyval', () => {
    //   //todo
    // })
  });

  describe('cleanUpSessionEventsStore', () => {
    test('should update events and status for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: SendingStatus.SENDING,
            },
            3: {
              events: [mockEventString],
              status: SendingStatus.SENDING,
            },
          },
        },
      };
      await eventsStorage.cleanUpSessionEventsStore(currentSessionId, 3);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: SendingStatus.SENDING,
            },
            3: {
              events: [],
              status: SendingStatus.SENT,
            },
          },
        },
      });
    });

    test('should delete sent sequences for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [],
              status: SendingStatus.SENT,
            },
            3: {
              events: [mockEventString],
              status: SendingStatus.SENDING,
            },
          },
        },
      };
      await eventsStorage.cleanUpSessionEventsStore(currentSessionId, 3);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: SendingStatus.SENT,
            },
          },
        },
      });
    });

    test('should keep sessions that are less than 3 days old, and delete sessions that are more than 3 days old', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const fourDayOldSessionId = new Date('2023-07-27 07:30:00').getTime();
      const oneDayOldSessionId = new Date('2023-07-30 07:30:00').getTime();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const mockIDBStore: IDBStore = {
        [oneDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: SendingStatus.SENDING,
            },
          },
        },
        [fourDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: SendingStatus.SENT,
            },
          },
        },
      };
      await eventsStorage.cleanUpSessionEventsStore(oneDayOldSessionId, 3);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        [oneDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: SendingStatus.SENT,
            },
          },
        },
      });
    });
    test('should catch errors', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      update.mockImplementationOnce(() => Promise.reject('error'));
      await eventsStorage.cleanUpSessionEventsStore(123, 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      update.mockImplementationOnce(() => Promise.resolve());
      await eventsStorage.cleanUpSessionEventsStore(123, 1);
      expect(update.mock.calls[0][1](undefined)).toEqual({});
    });
  });

  describe('storeSendingEvents', () => {
    test('should store events that are in progress going to the backend', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });

      await eventsStorage.storeSendingEvents(123, [mockEventString]);

      expect(mockDB.put).toHaveBeenCalledTimes(1);
      expect(mockDB.put).toHaveBeenCalledWith('sendingSequences', {
        sessionId: 123,
        events: [mockEventString],
        status: SendingStatus.SENDING,
      });
    });
    test('should catch errors', async () => {
      mockDB.put = jest.fn().mockImplementationOnce(() => Promise.reject('error'));
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.storeSendingEvents(123, [mockEventString]);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
  });
});
