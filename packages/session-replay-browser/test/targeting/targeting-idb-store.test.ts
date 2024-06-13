import { Logger } from '@amplitude/analytics-types';
import * as TargetingIDBStore from '../../src/targeting/targeting-idb-store';

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';

describe('TargetingIDBStore', () => {
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

  describe('getTargetingMatchForSession', () => {
    test('should return the targeting match from idb store', async () => {
      await TargetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
        targetingMatch: true,
      });
      const targetingMatch = await TargetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      expect(targetingMatch).toEqual(true);
    });
    test('should return undefined if no matching entry in the store', async () => {
      const targetingMatch = await TargetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      expect(targetingMatch).toEqual(undefined);
    });
    test('should catch errors', async () => {
      jest.spyOn(TargetingIDBStore, 'createStore').mockRejectedValueOnce('error');
      await TargetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to get targeting match for session id 123: error',
      );
    });
  });

  describe('storeTargetingMatchForSession', () => {
    test('should add the targeting match to idb store', async () => {
      await TargetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
        targetingMatch: true,
      });
      const targetingMatch = await TargetingIDBStore.getTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
      });
      expect(targetingMatch).toEqual(true);
    });
    test('should catch errors', async () => {
      jest.spyOn(TargetingIDBStore, 'createStore').mockRejectedValueOnce('error');
      await TargetingIDBStore.storeTargetingMatchForSession({
        loggerProvider: mockLoggerProvider,
        sessionId: 123,
        apiKey,
        targetingMatch: true,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store targeting match for session id 123: error',
      );
    });
  });
});
