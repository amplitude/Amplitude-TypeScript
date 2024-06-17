/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@amplitude/analytics-types';
import { IDBPDatabase } from 'idb';
import * as TargetingIDBStore from '../src/targeting-idb-store';
import { TargetingDB } from '../src/targeting-idb-store';

type MockedLogger = jest.Mocked<Logger>;

const mockLoggerProvider: MockedLogger = {
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

describe('targeting idb store', () => {
  describe('storeEventTypeForSession', () => {
    test('should add event to stored event list', async () => {
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Purchase',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const db = await TargetingIDBStore.createStore('static_key_amp_targeting');
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        { eventTypes: [{ event_type: 'Add to Cart' }, { event_type: 'Purchase' }], sessionId: 123 },
      ]);
    });

    test('should return updated list', async () => {
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const updatedList = await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Purchase',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(updatedList).toEqual([{ event_type: 'Add to Cart' }, { event_type: 'Purchase' }]);
    });

    test('should handle errors', async () => {
      jest.spyOn(TargetingIDBStore, 'updateEventListForSession').mockRejectedValueOnce('error');
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('should handle errors on updating event list', async () => {
      const mockDB: IDBPDatabase<TargetingDB> = {
        transaction: jest.fn().mockImplementation(() => {
          return {
            store: {
              put: jest.fn().mockImplementation(() => Promise.reject('put error')),
            },
          };
        }),
      } as unknown as IDBPDatabase<TargetingDB>;
      jest.spyOn(TargetingIDBStore, 'createStore').mockResolvedValue(mockDB);
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('should handle undefinted transaction', async () => {
      const mockDB: IDBPDatabase<TargetingDB> = {
        transaction: jest.fn().mockImplementation(() => undefined),
      } as unknown as IDBPDatabase<TargetingDB>;
      jest.spyOn(TargetingIDBStore, 'createStore').mockResolvedValue(mockDB);
      const updatedEventTypes = await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(updatedEventTypes).toBeUndefined();
    });

    test('should delete old sessions', async () => {
      // Set current time to 08:30
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      // Insert older session
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Add to Cart',
        sessionId: new Date('2023-07-25 08:30:00').getTime(),
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const db = await TargetingIDBStore.createStore('static_key_amp_targeting');
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        { eventTypes: [{ event_type: 'Add to Cart' }], sessionId: new Date('2023-07-25 08:30:00').getTime() },
      ]);
      await TargetingIDBStore.storeEventTypeForSession({
        eventType: 'Purchase',
        sessionId: new Date('2023-07-31 07:30:00').getTime(),
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntriesUpdated = await db.getAll('eventTypesForSession');
      expect(allEntriesUpdated).toEqual([
        { eventTypes: [{ event_type: 'Purchase' }], sessionId: new Date('2023-07-31 07:30:00').getTime() },
      ]);
    });
  });
});
