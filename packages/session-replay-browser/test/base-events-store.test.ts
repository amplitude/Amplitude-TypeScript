import { Logger } from '@amplitude/analytics-types';
import { InMemoryEventsStore } from '../src/events/events-memory-store';

describe('BaseEventsStore', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  const mockLoggerProvider: Logger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

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
