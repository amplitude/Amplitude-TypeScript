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

  test('uses byte-accurate size measurement for multi-byte characters', () => {
    // '🌍' has str.length = 2 (surrogate pair) but UTF-8 byte size = 4.
    // Set maxPersistedEventsSize = 3 so that byte-accurate measurement triggers a
    // split (size 4 >= 3) but a str.length-based check would not (2 < 3).
    // With an empty events list, getEventsArraySize overhead = 2 bytes (for "[]").
    // Total = 2 (overhead) + byte_size('🌍').
    // Byte-accurate: 2 + 4 = 6  →  6 >= 5  → split = true
    // str.length:    2 + 2 = 4  →  4 >= 5  → split = false (wrong)
    const store = new InMemoryEventsStore({
      loggerProvider: mockLoggerProvider,
      maxPersistedEventsSize: 5,
    });
    expect(store.shouldSplitEventsList([], '🌍')).toBe(true);
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
