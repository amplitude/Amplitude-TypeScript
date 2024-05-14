/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@amplitude/analytics-types';
import { IDBPDatabase } from 'idb';
import * as EventsIDBStore from '../src/events-idb-store';
import { SessionReplayDB, SessionReplayEventsIDBStore } from '../src/events-idb-store';

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';
const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEvent2 = {
  type: 2,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);
const mockEventString2 = JSON.stringify(mockEvent2);

function mockStoreForError() {
  const mockDB: IDBPDatabase<SessionReplayDB> = {
    get: jest.fn().mockImplementation(() => Promise.reject('get error')),
    put: jest.fn().mockImplementation(() => Promise.reject('put error')),
  } as unknown as IDBPDatabase<SessionReplayDB>;
  jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValue(mockDB);
}

describe('SessionReplayEventsIDBStore', () => {
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

  describe('initialize', () => {
    test('should create a store with a custom key', async () => {
      jest.spyOn(EventsIDBStore, 'createStore');
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      expect(EventsIDBStore.createStore).toHaveBeenCalledWith('static_key_amp_session_replay_events');
    });
    // test.skip('should transition from keyval', () => {
    //   //todo
    // })
  });

  describe('getSequencesToSend', () => {
    test('should fetch all sequences that have not yet been sent to the backend', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      await eventsStorage.db?.put('sequencesToSend', {
        sessionId: 123,
        events: [mockEventString],
      });
      await eventsStorage.db?.put('sequencesToSend', {
        sessionId: 456,
        events: [mockEventString],
      });
      await eventsStorage.db?.put('sequencesToSend', {
        sessionId: 456,
        events: [mockEventString, mockEventString],
      });
      const unsentSequences = await eventsStorage.getSequencesToSend();
      expect(unsentSequences).toEqual([
        {
          sessionId: 123,
          sequenceId: 1,
          events: [mockEventString],
        },
        {
          sessionId: 456,
          sequenceId: 2,
          events: [mockEventString],
        },
        {
          sessionId: 456,
          sequenceId: 3,
          events: [mockEventString, mockEventString],
        },
      ]);
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });

      const unsentSequences = await eventsStorage.getSequencesToSend();
      expect(unsentSequences).toBeUndefined();
    });

    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const unsentSequences = await eventsStorage.getSequencesToSend();
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(unsentSequences).toBeUndefined();
    });
  });

  describe('storeCurrentSequence', () => {
    test('should get the current sequence, store it in sequences to send, and return current sequence with an id', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      // Put data in for two different sessions to represent a more realistic scenario
      await eventsStorage.db?.put('sessionCurrentSequence', {
        sessionId: 123,
        events: [mockEventString, mockEventString],
      });
      await eventsStorage.db?.put('sessionCurrentSequence', {
        sessionId: 456,
        events: [mockEventString, mockEventString],
      });

      const sequenceData = await eventsStorage.storeCurrentSequence(123);

      expect(sequenceData).toEqual({
        sessionId: 123,
        sequenceId: 1,
        events: [mockEventString, mockEventString],
      });
    });
    test('should return undefined if there is no current sequence data', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const sequenceData = await eventsStorage.storeCurrentSequence(123);

      expect(sequenceData).toBeUndefined();
    });
    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const sequenceData = await eventsStorage.storeCurrentSequence(123);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(sequenceData).toBeUndefined();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });

      const sequenceData = await eventsStorage.storeCurrentSequence(123);
      expect(sequenceData).toBeUndefined();
    });
  });

  describe('addEventToCurrentSequence', () => {
    test('should create a new list if there are no existing sequence events', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString);
      expect(eventsToSend).toBeUndefined();
      const allSessionCurrentSequence = await eventsStorage.db?.getAll('sessionCurrentSequence');
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString], sessionId: 123 }]);
    });
    test('should add event to list if there is an existing list', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      await eventsStorage.db?.put('sessionCurrentSequence', { sessionId: 123, events: [mockEventString] });
      await eventsStorage.db?.put('sessionCurrentSequence', { sessionId: 456, events: [mockEventString] });
      eventsStorage.timeAtLastSplit = new Date('2023-07-31 08:30:00').getTime();
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString);
      expect(eventsToSend).toBeUndefined();
      const allSessionCurrentSequence = await eventsStorage.db?.getAll('sessionCurrentSequence');
      expect(allSessionCurrentSequence).toEqual([
        { events: [mockEventString, mockEventString], sessionId: 123 },
        { events: [mockEventString], sessionId: 456 },
      ]);
    });

    test('should split the events list at an increasing interval and send', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      eventsStorage.timeAtLastSplit = new Date('2023-07-31 08:30:00').getTime();
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:31:00').getTime());

      await eventsStorage.db?.put('sessionCurrentSequence', { sessionId: 123, events: [mockEventString] });

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toEqual({ sessionId: 123, events: [mockEventString], sequenceId: 1 });
      const allSessionCurrentSequence = await eventsStorage.db?.getAll('sessionCurrentSequence');
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString2], sessionId: 123 }]);
    });

    test('should split the events list at max size and send', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      eventsStorage.maxPersistedEventsSize = 20;
      // Simulate as if many events have already been built up
      const events = ['#'.repeat(20)];
      await eventsStorage.db?.put('sessionCurrentSequence', { sessionId: 123, events: events });

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toEqual({ sessionId: 123, events: events, sequenceId: 1 });
      const allSessionCurrentSequence = await eventsStorage.db?.getAll('sessionCurrentSequence');
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString2], sessionId: 123 }]);
    });

    test('should return undefined if storeSendingEvents fails', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      eventsStorage.storeSendingEvents = jest.fn().mockResolvedValue(undefined);
      // Fake as if there are events to send
      eventsStorage.timeAtLastSplit = new Date('2023-07-31 08:30:00').getTime();
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:31:00').getTime());
      await eventsStorage.db?.put('sessionCurrentSequence', { sessionId: 123, events: [mockEventString] });

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toBeUndefined();
    });

    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString2);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(eventsToSend).toBeUndefined();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });

      const eventsToSend = await eventsStorage.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toBeUndefined();
    });
  });

  describe('storeSendingEvents', () => {
    test('should store events and return a sequence id', async () => {
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const sequenceId = await eventsStorage.storeSendingEvents(123, [mockEventString]);

      expect(sequenceId).toBe(1);
      const allSequencesToSend = await eventsStorage.db?.getAll('sequencesToSend');
      expect(allSequencesToSend).toEqual([{ events: [mockEventString], sessionId: 123, sequenceId: 1 }]);
    });
    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      const sequenceId = await eventsStorage.storeSendingEvents(123, [mockEventString]);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(sequenceId).toBeUndefined();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });

      const sequenceId = await eventsStorage.storeSendingEvents(123, [mockEventString]);
      expect(sequenceId).toBeUndefined();
    });
  });

  describe('cleanUpSessionEventsStore', () => {
    test('should delete sequence to send', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const nextSessionId = new Date('2023-07-31 08:30:00').getTime();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();
      await eventsStorage.db?.put('sequencesToSend', {
        sessionId: currentSessionId,
        events: [mockEventString],
      });
      await eventsStorage.db?.put('sequencesToSend', {
        sessionId: nextSessionId,
        events: [mockEventString2],
      });

      await eventsStorage.cleanUpSessionEventsStore(1);

      const allSequencesToSend = await eventsStorage.db?.getAll('sequencesToSend');
      expect(allSequencesToSend).toEqual([{ events: [mockEventString2], sessionId: nextSessionId, sequenceId: 2 }]);
    });
    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      await eventsStorage.initialize();

      await eventsStorage.cleanUpSessionEventsStore(1);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = new SessionReplayEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });

      await eventsStorage.cleanUpSessionEventsStore(1);
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });
  });

  describe('createEventsIDBStore', () => {
    test('should create an IDB store instance and initialize it', async () => {
      const eventsIDBStore = await EventsIDBStore.createEventsIDBStore({ apiKey, loggerProvider: mockLoggerProvider });
      expect(eventsIDBStore.db).toBeDefined();
    });
  });
});
