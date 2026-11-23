import { Logger } from '@amplitude/analytics-types';
import * as Targeting from '@amplitude/targeting';
import { IDBPDatabase } from 'idb';
import { SessionReplayJoinedConfig } from '../../src/config/types';
import { SessionReplayTargetingDB, targetingIDBStore } from '../../src/targeting/targeting-idb-store';
import { evaluateTargetingAndStore } from '../../src/targeting/targeting-manager';
import { flagConfig } from '../flag-config-data';

type MockedLogger = jest.Mocked<Logger>;

jest.mock('@amplitude/targeting');
type MockedTargeting = jest.Mocked<typeof import('@amplitude/targeting')>;

describe('Targeting Manager', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { evaluateTargeting } = Targeting as MockedTargeting;
  let originalFetch: typeof global.fetch;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const config: SessionReplayJoinedConfig = {
    apiKey: 'static_key',
    loggerProvider: mockLoggerProvider,
    sampleRate: 1,
    targetingConfig: flagConfig,
  } as unknown as SessionReplayJoinedConfig;
  let db: IDBPDatabase<SessionReplayTargetingDB>;
  beforeEach(async () => {
    db = await targetingIDBStore.openOrCreateDB('static_key');
    await db.clear('sessionTargetingMatch');
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
  });
  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;

    jest.useRealTimers();
  });

  describe('evaluateTargetingAndStore', () => {
    let storeTargetingMatchForSessionMock: jest.SpyInstance;
    let getTargetingDetailsForSessionMock: jest.SpyInstance;
    beforeEach(() => {
      storeTargetingMatchForSessionMock = jest.spyOn(targetingIDBStore, 'storeTargetingMatchForSession');
      getTargetingDetailsForSessionMock = jest.spyOn(targetingIDBStore, 'getTargetingDetailsForSession');
    });
    test('should return a true match from IndexedDB', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingDetailsForSession').mockResolvedValueOnce({
        sessionId: '123',
        targetingMatch: true,
        targetingConditionName: 'Checkout errors',
        targetingConditionId: 'condition-123',
        lastUpdated: Date.now(),
      });
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });
      expect(getTargetingDetailsForSessionMock).toHaveBeenCalled();
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(targetingResult).toEqual({
        targetingMatch: true,
        targetingConditionName: 'Checkout errors',
        targetingConditionId: 'condition-123',
      });
    });

    test('should use remote config to determine targeting match', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
      };
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        targetingParams: {
          userProperties: mockUserProperties,
        },
      });
      expect(evaluateTargeting).toHaveBeenCalledWith({
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
        flag: flagConfig,
        sessionId: 123,
        userProperties: mockUserProperties,
      });
      expect(targetingResult.targetingMatch).toBe(true);
    });

    test('should store the matched targeting condition name and id', async () => {
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
          metadata: {
            segmentName: 'Checkout errors',
            segmentId: 'condition-123',
          },
        },
      });

      await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });

      expect(storeTargetingMatchForSessionMock).toHaveBeenCalledWith({
        targetingMatch: true,
        targetingConditionName: 'Checkout errors',
        targetingConditionId: 'condition-123',
        sessionId: 123,
        apiKey: config.apiKey,
        loggerProvider: mockLoggerProvider,
      });
    });

    test('should pass page to evaluateTargeting when provided in targetingParams', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const page = { url: 'https://example.com/analytics' };
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        targetingParams: {
          userProperties: {},
          page,
        },
      });
      expect(evaluateTargeting).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'static_key',
          loggerProvider: mockLoggerProvider,
          flag: flagConfig,
          sessionId: 123,
          page,
        }),
      );
      expect(targetingResult.targetingMatch).toBe(true);
    });

    test('should re-evaluate when urlChange is true even if IDB cache is true (URL change)', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingDetailsForSession').mockResolvedValueOnce({
        sessionId: '123',
        targetingMatch: true,
        lastUpdated: Date.now(),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: { key: 'off' },
      });
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        targetingParams: { page: { url: 'https://example.com/new-page' } },
        urlChange: true,
      });
      expect(evaluateTargeting).toHaveBeenCalled();
      expect(targetingResult.targetingMatch).toBe(false);
    });

    test('should store sessionTargetingMatch', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });
      expect(storeTargetingMatchForSessionMock).toHaveBeenCalledWith({
        targetingMatch: true,
        sessionId: 123,
        apiKey: config.apiKey,
        loggerProvider: mockLoggerProvider,
      });
      expect(targetingResult.targetingMatch).toBe(true);
    });
    test('should handle error', async () => {
      jest.spyOn(targetingIDBStore, 'storeTargetingMatchForSession').mockImplementationOnce(() => {
        throw new Error('storage error');
      });
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });
      expect(targetingResult.targetingMatch).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('storage error');
    });

    test('should parse string sessionId to number when calling evaluateTargeting', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const targetingResult = await evaluateTargetingAndStore({
        sessionId: '456',
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });
      expect(evaluateTargeting).toHaveBeenCalledWith({
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
        flag: flagConfig,
        sessionId: 456,
      });
      expect(targetingResult.targetingMatch).toBe(true);
    });
  });
});
