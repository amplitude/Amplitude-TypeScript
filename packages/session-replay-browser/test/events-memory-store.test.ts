// We don't want to call expects in conditions and typescript doesn't take these checks into account.
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ILogger } from '@amplitude/analytics-core';
import { InMemoryEventsStore } from '../src/events/events-memory-store';

const mockLoggerProvider: ILogger = {
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

      const {
        sequenceId,
        events,
        sessionId: sequenceSessionId,
      } = (await store.addEventToCurrentSequence(sessionId, 'test'))!;
      expect(sequenceId).toBe(0);
      expect(events).toStrictEqual(['test']);
      expect(sequenceSessionId).toStrictEqual(sessionId);
    });

    test('handles missing batchSizes entry gracefully (defensive ?? 0 fallback)', async () => {
      // Manually insert a sequence entry without a corresponding batchSizes entry
      // to exercise the defensive `?? 0` fallbacks on lines 47 and 53.
      (store as any).sequences[sessionId] = [];
      // batchSizes has no entry for sessionId — should default to 0 without throwing
      expect(await store.addEventToCurrentSequence(sessionId, 'test')).toBeUndefined();
    });
  });

  describe('storeCurrentSequence', () => {
    test('no sequence id produced', async () => {
      expect(await store.storeCurrentSequence(sessionId)).toBeUndefined();
    });

    test('sequence id produced', async () => {
      await store.addEventToCurrentSequence(sessionId, 'test');
      const { sequenceId, events, sessionId: sequenceSessionId } = (await store.storeCurrentSequence(sessionId))!;
      expect(sequenceId).toBe(0);
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
      expect(sequenceId).toBe(0);
      expect(events).toStrictEqual(['test']);
      expect(sequenceSessionId).toStrictEqual(sessionId);
    });
  });

  describe('storeSendingEvents', () => {
    test('stores events', async () => {
      expect(await store.storeSendingEvents(sessionId, ['test'])).toBe(0);
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
