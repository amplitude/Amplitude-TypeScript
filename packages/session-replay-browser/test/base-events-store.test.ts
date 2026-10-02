import { ILogger } from '@amplitude/analytics-core';
import { InMemoryEventsStore } from '../src/events/events-memory-store';
import { utf8ByteLength } from '../src/utils/utf8-byte-length';

describe('BaseEventsStore', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  const mockLoggerProvider: ILogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  describe('byte-accurate size measurement', () => {
    test('counts 4-byte UTF-8 characters correctly (surrogate pair)', () => {
      // '🌍' has str.length = 2 (surrogate pair) but UTF-8 byte size = 4.
      // With an empty events list, getEventsArraySize adds 2 bytes of overhead ("[]").
      // Total = 2 (overhead) + byte_size('🌍').
      // Byte-accurate: 2 + 4 = 6  →  6 >= 5  → split = true
      // str.length:    2 + 2 = 4  →  4 >= 5  → split = false (wrong)
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 5,
      });
      expect(store.shouldSplitEventsList([], '🌍')).toBe(true);
    });

    test('counts 2-byte UTF-8 characters correctly', () => {
      // 'é' (U+00E9) has str.length = 1 but UTF-8 byte size = 2.
      // overhead(2) + 2 = 4  →  4 >= 4  → split = true (byte-accurate)
      // str.length: 2 + 1 = 3  →  3 >= 4  → split = false (wrong)
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 4,
      });
      expect(store.shouldSplitEventsList([], 'é')).toBe(true);
    });

    test('counts 3-byte UTF-8 characters correctly', () => {
      // '€' (U+20AC) has str.length = 1 but UTF-8 byte size = 3.
      // overhead(2) + 3 = 5  →  5 >= 5  → split = true (byte-accurate)
      // str.length: 2 + 1 = 3  →  3 >= 5  → split = false (wrong)
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 5,
      });
      expect(store.shouldSplitEventsList([], '€')).toBe(true);
    });

    test('handles orphaned high surrogate as 3 bytes', () => {
      // '\uD800' is a lone high surrogate with no following low surrogate.
      // The encoder treats it as a replacement character: 3 UTF-8 bytes.
      // overhead(2) + 3 = 5  →  5 >= 5  → split = true
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 5,
      });
      expect(store.shouldSplitEventsList([], '\uD800')).toBe(true);
    });

    test('handles orphaned low surrogate as 3 bytes', () => {
      // '\uDC00' is a lone low surrogate with no preceding high surrogate.
      // Falls into the else branch → treated as a 3-byte BMP character.
      // overhead(2) + 3 = 5  →  5 >= 5  → split = true
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 5,
      });
      expect(store.shouldSplitEventsList([], '\uDC00')).toBe(true);
    });
  });

  describe('maxPersistedEventsSize threshold', () => {
    test('splits when the buffered list reaches the configured byte cap', () => {
      // cap = 1000. One 996-byte ASCII event + overhead(2) = 998 < 1000 → no split.
      // Adding another 996-byte event would push well past 1000 → split.
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 1_000,
      });
      const event = 'a'.repeat(996);
      expect(store.shouldSplitEventsList([], event)).toBe(false);
      expect(store.shouldSplitEventsList([event], event)).toBe(true);
    });

    test('does not split a small event under the default cap when omitted', () => {
      // Default DEFAULT_MAX_PERSISTED_EVENTS_SIZE_BYTES (6 MB) — a tiny event is nowhere near it.
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
      });
      expect(store.shouldSplitEventsList([], 'small-event')).toBe(false);
    });
  });

  test('should split based on time', async () => {
    jest.useFakeTimers().setSystemTime(Date.now());
    const store = new InMemoryEventsStore({
      loggerProvider: mockLoggerProvider,
    });
    await store.addEventToCurrentSequence(1234, 'test');
    jest.advanceTimersByTime(36_000_000);

    expect(store.shouldSplitEventsList(['test'], 'test')).toBe(true);
    return;
  });

  describe('first-split interval honors caller-supplied minInterval', () => {
    // Regression: class-field initializer `private interval = this.minInterval` ran before
    // the constructor body, so `interval` froze at the class-field default (500ms) regardless
    // of `args.minInterval`. The fix moves that assignment into the constructor body.
    test('does not split before minInterval has elapsed', async () => {
      jest.useFakeTimers().setSystemTime(Date.now());
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        minInterval: 5_000,
        maxInterval: 30_000,
      });
      await store.addEventToCurrentSequence(1, 'a');
      // Advance past the class-field default (500ms) but well under the configured 5s min.
      jest.advanceTimersByTime(1_000);
      expect(store.shouldSplitEventsList(['a'], 'b')).toBe(false);
    });

    test('splits once minInterval has elapsed', async () => {
      jest.useFakeTimers().setSystemTime(Date.now());
      const store = new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        minInterval: 5_000,
        maxInterval: 30_000,
      });
      await store.addEventToCurrentSequence(1, 'a');
      jest.advanceTimersByTime(5_001);
      expect(store.shouldSplitEventsList(['a'], 'b')).toBe(true);
    });
  });

  describe('incremental UTF-8 size cache', () => {
    const cap = 500;

    // Independent of the store cache: sums every string on every call.
    const sizeSplit = (events: string[], next: string): boolean => {
      let content = 0;
      for (const event of events) content += utf8ByteLength(event);
      const overhead = 2 + Math.max(0, events.length - 1) + events.length * 2;
      return content + overhead + utf8ByteLength(next) >= cap;
    };

    const store = () =>
      new InMemoryEventsStore({
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: cap,
        minInterval: 60_000_000,
      });

    test('matches a full recount as the same array is appended', () => {
      const eventsStore = store();
      const events: string[] = [];
      const incoming = ['a'.repeat(40), 'é'.repeat(20), '€'.repeat(10), '🎉'.repeat(5), '\uD800', '\uDC00', 'tail'];
      const batch = Array.from({ length: 12 }, () => incoming).flat();
      for (const next of batch) {
        expect(eventsStore.shouldSplitEventsList(events, next)).toBe(sizeSplit(events, next));
        events.push(next);
      }
    });

    test('matches a full recount when more than one event is appended between checks', () => {
      const eventsStore = store();
      const events: string[] = [];
      for (let i = 0; i < 30; i++) {
        const next = i % 2 === 0 ? 'é'.repeat(i + 1) : 'a'.repeat(i + 1);
        expect(eventsStore.shouldSplitEventsList(events, next)).toBe(sizeSplit(events, next));
        events.push(next, `${next}x`);
      }
    });

    test('reuses the cached size when the same array is checked again', () => {
      const eventsStore = store();
      const events: string[] = [];
      expect(eventsStore.shouldSplitEventsList(events, 'a')).toBe(false);
      expect(eventsStore.shouldSplitEventsList(events, 'a')).toBe(false);
      events.push('é'.repeat(10));
      expect(eventsStore.shouldSplitEventsList(events, 'a')).toBe(sizeSplit(events, 'a'));
      expect(eventsStore.shouldSplitEventsList(events, 'a')).toBe(sizeSplit(events, 'a'));
    });

    test('recounts when the last event string is replaced in place', () => {
      const eventsStore = store();
      const events = ['abcd'];
      expect(eventsStore.shouldSplitEventsList(events, 'z')).toBe(false);
      events[0] = 'é'.repeat(400);
      expect(eventsStore.shouldSplitEventsList(events, 'z')).toBe(true);
    });
  });
});
