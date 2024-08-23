import { Logger } from '@amplitude/analytics-types';
import { IDBPDatabase } from 'idb';
import { SessionReplayTargetingDB, targetingIDBStore } from '../../src/targeting/targeting-idb-store';

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';

describe('TargetingIDBStore', () => {
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  let db: IDBPDatabase<SessionReplayTargetingDB>;
  beforeEach(async () => {
    db = await targetingIDBStore.openOrCreateDB('static_key');
    await db.clear('sessionTargetingMatch');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('getTargetingMatchForSession', () => {
    test('should return the targeting match from idb store', async () => {
      await targetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
        targetingMatch: true,
      });
      const targetingMatch = await targetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      expect(targetingMatch).toEqual(true);
    });
    test('should return undefined if no matching entry in the store', async () => {
      const targetingMatch = await targetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      expect(targetingMatch).toEqual(undefined);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<SessionReplayTargetingDB> = {
        get: jest.fn().mockImplementation(() => Promise.reject('error')),
      } as unknown as IDBPDatabase<SessionReplayTargetingDB>;
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValueOnce(mockDB);
      await targetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to get targeting match for session id 123: error',
      );
    });
  });

  describe('storeTargetingMatchForSession', () => {
    test('should add the targeting match to idb store', async () => {
      await targetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
        targetingMatch: true,
      });
      const targetingMatch = await targetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      expect(targetingMatch).toEqual(true);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<SessionReplayTargetingDB> = {
        put: jest.fn().mockImplementation(() => Promise.reject('error')),
      } as unknown as IDBPDatabase<SessionReplayTargetingDB>;
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValueOnce(mockDB);
      await targetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
        targetingMatch: true,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store targeting match for session id 123: error',
      );
    });
  });

  describe('clearStoreOfOldSessions', () => {
    test('should delete object stores with sessions older than 2 days', async () => {
      // Set current time to 08:30
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      // Current session from one hour before, 07:30
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      await targetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        apiKey,
        sessionId: currentSessionId,
        targetingMatch: true,
      });
      // Add session from the same day
      await targetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        apiKey,
        sessionId: new Date('2023-07-31 05:30:00').getTime(),
        targetingMatch: true,
      });
      // Add session from one month ago
      await targetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        apiKey,
        sessionId: new Date('2023-06-31 10:30:00').getTime(),
        targetingMatch: true,
      });
      const allEntries =
        targetingIDBStore.dbs && (await targetingIDBStore.dbs['static_key'].getAll('sessionTargetingMatch'));
      expect(allEntries).toEqual([
        {
          sessionId: new Date('2023-06-31 10:30:00').getTime(),
          targetingMatch: true,
        },
        {
          sessionId: new Date('2023-07-31 05:30:00').getTime(),
          targetingMatch: true,
        },
        {
          sessionId: currentSessionId,
          targetingMatch: true,
        },
      ]);

      await targetingIDBStore.clearStoreOfOldSessions({
        loggerProvider: mockLoggerProvider,
        apiKey,
        currentSessionId,
      });

      const allEntriesUpdated =
        targetingIDBStore.dbs && (await targetingIDBStore.dbs['static_key'].getAll('sessionTargetingMatch'));
      // Only one month old entry should be deleted
      expect(allEntriesUpdated).toEqual([
        {
          sessionId: new Date('2023-07-31 05:30:00').getTime(),
          targetingMatch: true,
        },
        {
          sessionId: currentSessionId,
          targetingMatch: true,
        },
      ]);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<SessionReplayTargetingDB> = {
        transaction: jest.fn().mockImplementation(() => {
          throw new Error('error');
        }),
      } as unknown as IDBPDatabase<SessionReplayTargetingDB>;
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValueOnce(mockDB);
      await targetingIDBStore.clearStoreOfOldSessions({
        loggerProvider: mockLoggerProvider,
        currentSessionId: 123,
        apiKey,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to clear old targeting matches for sessions: Error: error',
      );
    });
  });
});
