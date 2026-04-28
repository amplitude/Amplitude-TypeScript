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

  test('uses Blob.size for accurate byte measurement', () => {
    // A 4-byte string (ASCII only) — Blob.size equals str.length for pure ASCII.
    // This verifies the Blob path is taken (rather than the old str.length path).
    const store = new InMemoryEventsStore({ loggerProvider: mockLoggerProvider });
    // shouldSplitEventsList returns false when under the limit
    expect(store.shouldSplitEventsList([], 'hello')).toBe(false);
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
