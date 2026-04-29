import { ILogger } from '@amplitude/analytics-core';
import { InMemoryEventsStore } from '../src/events/events-memory-store';

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
});
