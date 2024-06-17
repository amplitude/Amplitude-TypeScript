/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@amplitude/analytics-types';
import { IDBPDatabase } from 'idb';
<<<<<<< HEAD
import { TargetingDB, targetingIDBStore } from '../src/targeting-idb-store';
=======
import * as TargetingIDBStore from '../src/targeting-idb-store';
import { TargetingDB } from '../src/targeting-idb-store';
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)

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
<<<<<<< HEAD
  let db: IDBPDatabase<TargetingDB>;
  beforeEach(async () => {
    db = await targetingIDBStore.openOrCreateDB('static_key');
    await db.clear('eventTypesForSession');
  });
  describe('storeEventTypeForSession', () => {
    test('should add event to stored event list', async () => {
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
  describe('storeEventTypeForSession', () => {
    test('should add event to stored event list', async () => {
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
<<<<<<< HEAD
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Purchase',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
<<<<<<< HEAD
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
=======
      const db = await TargetingIDBStore.createStore('static_key_amp_targeting');
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        { eventTypes: [{ event_type: 'Add to Cart' }, { event_type: 'Purchase' }], sessionId: 123 },
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
      ]);
    });

    test('should return updated list', async () => {
<<<<<<< HEAD
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
<<<<<<< HEAD
      const updatedList = await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      const updatedList = await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Purchase',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
<<<<<<< HEAD
      expect(updatedList).toEqual({
        'Add to Cart': { '123': { event_type: 'Add to Cart' } },
        Purchase: { '123': { event_type: 'Purchase' } },
      });
    });

    test('should handle errors', async () => {
      jest.spyOn(targetingIDBStore, 'updateEventListForSession').mockRejectedValueOnce('error');
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      expect(updatedList).toEqual([{ event_type: 'Add to Cart' }, { event_type: 'Purchase' }]);
    });

    test('should handle errors', async () => {
      jest.spyOn(TargetingIDBStore, 'updateEventListForSession').mockRejectedValueOnce('error');
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
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
<<<<<<< HEAD
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValue(mockDB);
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      jest.spyOn(TargetingIDBStore, 'createStore').mockResolvedValue(mockDB);
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Add to Cart',
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

<<<<<<< HEAD
    test('should handle undefined transaction', async () => {
      const mockDB: IDBPDatabase<TargetingDB> = {
        transaction: jest.fn().mockImplementation(() => undefined),
      } as unknown as IDBPDatabase<TargetingDB>;
      jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValue(mockDB);
      const updatedEventTypes = await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
    test('should handle undefinted transaction', async () => {
      const mockDB: IDBPDatabase<TargetingDB> = {
        transaction: jest.fn().mockImplementation(() => undefined),
      } as unknown as IDBPDatabase<TargetingDB>;
      jest.spyOn(TargetingIDBStore, 'createStore').mockResolvedValue(mockDB);
      const updatedEventTypes = await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
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
<<<<<<< HEAD
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Add to Cart',
        sessionId: new Date('2023-07-25 08:30:00').getTime(),
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
<<<<<<< HEAD
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        {
          eventTypes: { 'Add to Cart': { 123: { event_type: 'Add to Cart' } } },
          sessionId: new Date('2023-07-25 08:30:00').getTime(),
        },
      ]);
      await targetingIDBStore.storeEventTypeForSession({
        eventTime: 123,
=======
      const db = await TargetingIDBStore.createStore('static_key_amp_targeting');
      const allEntries = await db.getAll('eventTypesForSession');
      expect(allEntries).toEqual([
        { eventTypes: [{ event_type: 'Add to Cart' }], sessionId: new Date('2023-07-25 08:30:00').getTime() },
      ]);
      await TargetingIDBStore.storeEventTypeForSession({
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
        eventType: 'Purchase',
        sessionId: new Date('2023-07-31 07:30:00').getTime(),
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      const allEntriesUpdated = await db.getAll('eventTypesForSession');
      expect(allEntriesUpdated).toEqual([
<<<<<<< HEAD
        {
          eventTypes: { Purchase: { 123: { event_type: 'Purchase' } } },
          sessionId: new Date('2023-07-31 07:30:00').getTime(),
        },
=======
        { eventTypes: [{ event_type: 'Purchase' }], sessionId: new Date('2023-07-31 07:30:00').getTime() },
>>>>>>> 79705348 (test(targeting + session replay): get test coverage up to 100%)
      ]);
    });
  });
});
