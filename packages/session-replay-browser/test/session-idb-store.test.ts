import { Logger } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import { SessionReplaySessionIDBStore } from '../src/session-idb-store';
import { IDBStore, RecordingStatus } from '../src/typings/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';
const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

describe('SessionReplaySessionIDBStore', () => {
  const { get, update } = IDBKeyVal as MockedIDBKeyVal;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('init', () => {
    test('should create a storage key', () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      expect(eventsStorage.storageKey).toBe('AMP_replay_unsent_static_key');
    });
  });
  describe('getAllSessionDataFromStore', () => {
    test('should catch errors', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      get.mockImplementationOnce(() => Promise.reject('error'));
      await eventsStorage.getAllSessionDataFromStore();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
  });

  describe('cleanUpSessionEventsStore', () => {
    test('should update events and status for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
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
              status: RecordingStatus.RECORDING,
            },
            3: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });

    test('should delete sent sequences for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
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
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });

    test('should keep sessions that are less than 3 days old, and delete sessions that are more than 3 days old', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const fourDayOldSessionId = new Date('2023-07-27 07:30:00').getTime();
      const oneDayOldSessionId = new Date('2023-07-30 07:30:00').getTime();
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const mockIDBStore: IDBStore = {
        [oneDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        [fourDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: RecordingStatus.SENT,
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
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });
    test('should catch errors', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
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
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      update.mockImplementationOnce(() => Promise.resolve());
      await eventsStorage.cleanUpSessionEventsStore(123, 1);
      expect(update.mock.calls[0][1](undefined)).toEqual({});
    });
  });

  describe('storeEventsForSession', () => {
    test('should update the session current sequence id, and the current sequence events and status', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const mockIDBStore: IDBStore = {
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await eventsStorage.storeEventsForSession([mockEventString], 2, 123);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });
    test('should add a new entry if none exist for sequence id', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const mockIDBStore: IDBStore = {
        123: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await eventsStorage.storeEventsForSession([mockEventString], 2, 123);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });
    test('should add a new entry if none exist for session id', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      const mockIDBStore: IDBStore = {
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await eventsStorage.storeEventsForSession([mockEventString], 0, 456);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
        456: {
          currentSequenceId: 0,
          sessionSequences: {
            0: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });
    test('should catch errors', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      update.mockImplementationOnce(() => Promise.reject('error'));
      await eventsStorage.storeEventsForSession([mockEventString], 0, 123);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const eventsStorage = new SessionReplaySessionIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      update.mockImplementationOnce(() => Promise.resolve());
      await eventsStorage.storeEventsForSession([mockEventString], 0, 456);
      expect(update.mock.calls[0][1](undefined)).toEqual({
        456: {
          currentSequenceId: 0,
          sessionSequences: {
            0: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });
  });
});
