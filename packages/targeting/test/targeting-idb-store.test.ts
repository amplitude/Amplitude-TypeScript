/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@amplitude/analytics-types';
import { IDBPDatabase } from 'idb';
import { TargetingDB, targetingIDBStore } from '../src/targeting-idb-store';

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
  let db: IDBPDatabase<TargetingDB>;
  beforeEach(async () => {
    db = await targetingIDBStore.openOrCreateDB('static_key');
    await db.clear('eventTypesForSession');
  });
  describe('storeEventTypeForSession', () => {
    test('should add event to stored event list', async () => {
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Purchase',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        {
          eventTypes: {
            'Add to Cart': { 123: { event_type: 'Add to Cart' } },
            Purchase: { 123: { event_type: 'Purchase' } },
          },
          sessionId: 123,
        },
      ]);
    });

    test('should handle adding the same event twice correctly', async () => {
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        {
          eventTypes: {
            'Add to Cart': { 123: { event_type: 'Add to Cart' } },
          },
          sessionId: 123,
        },
      ]);
    });

    test('should add the same event with different timestamps', async () => {
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 456,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        {
          eventTypes: {
            'Add to Cart': { 123: { event_type: 'Add to Cart' }, 456: { event_type: 'Add to Cart' } },
          },
          sessionId: 123,
        },
      ]);
    });

    test('should return updated list', async () => {
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const updatedList = await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Purchase',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(updatedList).toEqual({
        'Add to Cart': { '123': { event_type: 'Add to Cart' } },
        Purchase: { '123': { event_type: 'Purchase' } },
      });
    });

    test('should handle errors', async () => {
      jest.spyOn(targetingIDBStore, 'updateEventListForSession').mockRejectedValueOnce('error');
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
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
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValue(mockDB);
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('should handle undefined transaction', async () => {
      const mockDB: IDBPDatabase<TargetingDB> = {
        transaction: jest.fn().mockImplementation(() => undefined),
      } as unknown as IDBPDatabase<TargetingDB>;
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValue(mockDB);
      const updatedEventTypes = await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
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
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Add to Cart',
        sessionId: new Date('2023-07-25 08:30:00').getTime(),
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        {
          eventTypes: { 'Add to Cart': { 123: { event_type: 'Add to Cart' } } },
          sessionId: new Date('2023-07-25 08:30:00').getTime(),
        },
      ]);
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
        eventType: 'Purchase',
        sessionId: new Date('2023-07-31 07:30:00').getTime(),
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntriesUpdated = await db.getAll('eventTypesForSession');
      expect(allEntriesUpdated).toEqual([
        {
          eventTypes: { Purchase: { 123: { event_type: 'Purchase' } } },
          sessionId: new Date('2023-07-31 07:30:00').getTime(),
        },
      ]);
    });
  });
});
