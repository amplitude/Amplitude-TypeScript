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

    // SR-4284: storeCurrentSequence on a session with a touched-but-empty buffer
    // (e.g. addEventToCurrentSequence then a flush draining the buffer) should NOT
    // finalize a zero-event sequence — that's the empty-body 400 root cause.
    test('returns undefined and warns when buffer exists but is empty', async () => {
      // Touch the buffer with a single event, then drain it via storeCurrentSequence.
      await store.addEventToCurrentSequence(sessionId, 'first');
      await store.storeCurrentSequence(sessionId);
      // Now buffer for sessionId is [] (touched, empty). Reset the warn spy so we
      // only see calls from the next operation.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (mockLoggerProvider.debug as jest.Mock).mockClear();

      expect(await store.storeCurrentSequence(sessionId)).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.debug).toHaveBeenCalledWith(
        expect.stringContaining('Filtered empty session replay sequence at storeCurrentSequence'),
      );
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

    // SR-4284: empty finalized sequences (e.g. drained from a previous SDK build via
    // storeSendingEvents, or from a future regression) must not be returned to the
    // network layer — they would POST as empty bodies and 400 on the server.
    test('filters out and prunes empty finalized sequences', async () => {
      // storeSendingEvents accepts any events array, including the [] case that older
      // SDK builds could emit via the split-with-empty-buffer path.
      await store.storeSendingEvents(sessionId, []);
      await store.storeSendingEvents(sessionId, ['real']);
      await store.storeSendingEvents(sessionId, []);

      const sequences = (await store.getSequencesToSend())!;
      expect(sequences).toHaveLength(1);
      expect(sequences[0].events).toStrictEqual(['real']);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.debug).toHaveBeenCalledWith(
        expect.stringContaining('Filtered empty session replay sequence'),
      );

      // Empty entries should have been pruned — a second call must see them gone
      // and not re-fire the sampled warn, otherwise old residue produces noise
      // indefinitely on every flush cycle.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (mockLoggerProvider.debug as jest.Mock).mockClear();
      const second = (await store.getSequencesToSend())!;
      expect(second).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.debug).not.toHaveBeenCalled();
    });
  });

  describe('addEventToCurrentSequence empty-buffer split guard (SR-4284)', () => {
    // Repro for the SR-4284 root cause: shouldSplitEventsList can return true even when
    // the current buffer is empty, because the size-constraint branch fires when a
    // single incoming event is larger than MAX_EVENT_LIST_SIZE (2 MB). Without the
    // guard, addSequence would finalize a zero-event sequence that later POSTs as an
    // empty body and 400s on the server.
    test('does not finalize a zero-event sequence when buffer is empty', async () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (mockLoggerProvider.debug as jest.Mock).mockClear();
      store.shouldSplitEventsList = jest.fn().mockReturnValue(true);
      const result = await store.addEventToCurrentSequence(sessionId, 'huge-event');
      expect(result).toBeUndefined();
      expect(await store.getSequencesToSend()).toStrictEqual([]);
      // Sampled warn fires at the root-cause filter site so post-deploy Datadog can
      // confirm the new SDK is preventing the bug at its source.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.debug).toHaveBeenCalledWith(
        expect.stringContaining('Filtered empty session replay sequence at addEventToCurrentSequence'),
      );
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
