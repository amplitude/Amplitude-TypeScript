import { Logger } from '@amplitude/analytics-types';
import * as Targeting from '@amplitude/targeting';
import { SessionReplayJoinedConfig } from '../../src/config/types';
import * as TargetingIDBStore from '../../src/targeting/targeting-idb-store';
import { evaluateTargetingAndStore } from '../../src/targeting/targeting-manager';
import { flagConfig } from '../flag-config-data';

type MockedLogger = jest.Mocked<Logger>;

jest.mock('@amplitude/targeting');
type MockedTargeting = jest.Mocked<typeof import('@amplitude/targeting')>;

describe('Targeting Manager', () => {
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
  beforeEach(() => {
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
    let getTargetingMatchForSessionMock: jest.SpyInstance;
    beforeEach(() => {
      storeTargetingMatchForSessionMock = jest.spyOn(TargetingIDBStore, 'storeTargetingMatchForSession');
      getTargetingMatchForSessionMock = jest.spyOn(TargetingIDBStore, 'getTargetingMatchForSession');
    });
    test('should return a true match from IndexedDB', async () => {
      jest.spyOn(TargetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(true);
      const sessionTargetingMatch = await evaluateTargetingAndStore({ sessionId: 123, config: config });
      expect(getTargetingMatchForSessionMock).toHaveBeenCalled();
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionTargetingMatch).toBe(true);
    });

    test('should use remote config to determine targeting match', async () => {
      jest.spyOn(TargetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      evaluateTargeting.mockReturnValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
      };
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        config,
        targetingParams: {
          userProperties: mockUserProperties,
        },
      });
      expect(evaluateTargeting).toHaveBeenCalledWith({
        flag: flagConfig,
        sessionId: 123,
        userProperties: mockUserProperties,
      });
      expect(sessionTargetingMatch).toBe(true);
    });
    test('should set sessionTargetingMatch to true if there is no targeting config', async () => {
      config.targetingConfig = undefined;
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        config,
      });
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionTargetingMatch).toBe(true);
    });
    test('should set sessionTargetingMatch to true if there is targeting config is empty object', async () => {
      config.targetingConfig = {} as unknown as Targeting.TargetingFlag;
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        config,
      });
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionTargetingMatch).toBe(true);
    });
    test('should store sessionTargetingMatch', async () => {
      evaluateTargeting.mockReturnValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        config,
      });
      expect(storeTargetingMatchForSessionMock).toHaveBeenCalledWith({
        targetingMatch: true,
        sessionId: 123,
        apiKey: config.apiKey,
        loggerProvider: mockLoggerProvider,
      });
      expect(sessionTargetingMatch).toBe(true);
    });
    test('should handle error', async () => {
      jest.spyOn(TargetingIDBStore, 'storeTargetingMatchForSession').mockImplementationOnce(() => {
        throw new Error('storage error');
      });
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        config,
      });
      expect(sessionTargetingMatch).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('storage error');
    });
  });
});
