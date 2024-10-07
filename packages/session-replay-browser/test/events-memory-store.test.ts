// We don't want to call expects in conditions and typescript doesn't take these checks into account.
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Logger } from '@amplitude/analytics-types';
import { InMemoryEventsStore } from '../src/events/events-memory-store';

const mockLoggerProvider: Logger = {
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

describe('InMemoryEventsStore', () => {
  let store: InMemoryEventsStore;
  let sessionId: number;

  beforeEach(() => {
    sessionId = Math.floor(Math.random() * 10000);
    store = new InMemoryEventsStore({
      loggerProvider: mockLoggerProvider,
    });
  });

  describe('addEventToCurrentSequence', () => {
    test('store does not produce sequence id after one event', async () => {
      expect(await store.addEventToCurrentSequence(sessionId, 'test')).toBeUndefined();
    });

    test('returns sequence id on split', async () => {
      await store.addEventToCurrentSequence(sessionId, 'test');
      store.shouldSplitEventsList = jest.fn().mockReturnValue(true);
      await store.addEventToCurrentSequence(sessionId, 'test');

      const {
        sequenceId,
        events,
        sessionId: sequenceSessionId,
      } = (await store.addEventToCurrentSequence(sessionId, 'test'))!;
      expect(sequenceId).toBeGreaterThanOrEqual(0);
      expect(events).toStrictEqual(['test']);
      expect(sequenceSessionId).toStrictEqual(sessionId);
    });
  });

  describe('storeCurrentSequence', () => {
    test('no sequence id produced', async () => {
      expect(await store.storeCurrentSequence(sessionId)).toBeUndefined();
    });

    test('sequence id produced', async () => {
      await store.addEventToCurrentSequence(sessionId, 'test');
      const { sequenceId, events, sessionId: sequenceSessionId } = (await store.storeCurrentSequence(sessionId))!;
      expect(sequenceId).toBeGreaterThanOrEqual(0);
      expect(events).toStrictEqual(['test']);
      expect(sequenceSessionId).toStrictEqual(sessionId);
    });
  });

  describe('getSequencesToSend', () => {
    test('get sequences', async () => {
      expect(await store.getSequencesToSend()).toStrictEqual([]);
    });

    test('get stored sequences', async () => {
      await store.addEventToCurrentSequence(sessionId, 'test');
      await store.storeCurrentSequence(sessionId);
      const sequences = (await store.getSequencesToSend())!;
      expect(sequences).toHaveLength(1);

      const { sequenceId, events, sessionId: sequenceSessionId } = sequences[0];
      expect(sequenceId).toBeGreaterThanOrEqual(0);
      expect(events).toStrictEqual(['test']);
      expect(sequenceSessionId).toStrictEqual(sessionId);
    });
  });

  describe('storeSendingEvents', () => {
    test('stores events', async () => {
      expect(await store.storeSendingEvents(sessionId, ['test'])).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanUpSessionEventsStore', () => {
    test('deletes sequence', async () => {
      // first build a new sequence
      const sequenceId = (await store.storeSendingEvents(sessionId, ['test']))!;
      const sequences = (await store.getSequencesToSend())!;
      expect(sequences).toHaveLength(1);

      const sequence = sequences[0];
      expect(sequence.sequenceId).toBe(sequenceId);

      // then delete it
      await store.cleanUpSessionEventsStore(sessionId, sequenceId);

      // then confirm it's deleted
      expect(await store.getSequencesToSend()).toStrictEqual([]);
    });
  });
});
