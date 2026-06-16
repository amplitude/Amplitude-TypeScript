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
    let getTargetingMatchForSessionMock: jest.SpyInstance;
    beforeEach(() => {
      storeTargetingMatchForSessionMock = jest.spyOn(targetingIDBStore, 'storeTargetingMatchForSession');
      getTargetingMatchForSessionMock = jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession');
    });
    test('should return a true match from IndexedDB', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(true);
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });
      expect(getTargetingMatchForSessionMock).toHaveBeenCalled();
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionTargetingMatch).toBe(true);
    });

    test('should use remote config to determine targeting match', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
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
      const sessionTargetingMatch = await evaluateTargetingAndStore({
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
      expect(sessionTargetingMatch).toBe(true);
    });

    test('should pass page to evaluateTargeting when provided in targetingParams', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const page = { url: 'https://example.com/analytics' };
      const sessionTargetingMatch = await evaluateTargetingAndStore({
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
      expect(sessionTargetingMatch).toBe(true);
    });

    test('should re-evaluate when urlChange is true even if IDB cache is true (URL change)', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: { key: 'off' },
      });
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        targetingParams: { page: { url: 'https://example.com/new-page' } },
        urlChange: true,
      });
      expect(evaluateTargeting).toHaveBeenCalled();
      expect(sessionTargetingMatch).toBe(false);
    });

    test('should store sessionTargetingMatch', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const sessionTargetingMatch = await evaluateTargetingAndStore({
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
      expect(sessionTargetingMatch).toBe(true);
    });
    test('should handle error', async () => {
      jest.spyOn(targetingIDBStore, 'storeTargetingMatchForSession').mockImplementationOnce(() => {
        throw new Error('storage error');
      });
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
      });
      expect(sessionTargetingMatch).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('storage error');
    });

    const makeDiagnosticsClient = () => ({
      setTag: jest.fn(),
      increment: jest.fn(),
      recordHistogram: jest.fn(),
      recordEvent: jest.fn(),
      _flush: jest.fn(),
      _setSampleRate: jest.fn(),
    });

    test('should record eval.result diagnostics event with srId on success', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: { key: 'on' },
      });
      const diagnosticsClient = makeDiagnosticsClient();
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        targetingParams: { page: { url: 'https://example.com/analytics' } },
        diagnosticsClient,
        deviceId: 'dev-1',
      });
      expect(sessionTargetingMatch).toBe(true);
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.eval.result',
        expect.objectContaining({
          sessionId: 123,
          deviceId: 'dev-1',
          srId: 'dev-1/123',
          pageUrl: 'https://example.com/analytics',
          variantKey: 'on',
          matched: true,
        }),
      );
    });

    test('should set srId undefined when deviceId is missing on success', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({ sr_targeting_config: { key: 'off' } });
      const diagnosticsClient = makeDiagnosticsClient();
      await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        diagnosticsClient,
        // deviceId intentionally omitted -> srId ternary falls to undefined
      });
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.eval.result',
        expect.objectContaining({ srId: undefined, matched: false, variantKey: 'off' }),
      );
    });

    test('should record variantKey null when targeting result is undefined', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce(undefined);
      const diagnosticsClient = makeDiagnosticsClient();
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        diagnosticsClient,
        deviceId: 'dev-1',
      });
      expect(sessionTargetingMatch).toBe(true);
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.eval.result',
        expect.objectContaining({ variantKey: null, matched: true }),
      );
    });

    test('should record variantKey null when targeting result has no sr_targeting_config', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({});
      const diagnosticsClient = makeDiagnosticsClient();
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        diagnosticsClient,
        deviceId: 'dev-1',
      });
      // No sr_targeting_config => default match true; raw verdict logged as null.
      expect(sessionTargetingMatch).toBe(true);
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.eval.result',
        expect.objectContaining({ variantKey: null, matched: true }),
      );
    });

    test('should set srId undefined when deviceId is missing in error path', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const diagnosticsClient = makeDiagnosticsClient();
      await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        diagnosticsClient,
        // deviceId intentionally omitted
      });
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.eval.error',
        expect.objectContaining({ srId: undefined, message: 'boom' }),
      );
    });

    test('should record eval.error diagnostics when evaluateTargeting throws', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockRejectedValueOnce(new Error('engine boom'));
      const diagnosticsClient = makeDiagnosticsClient();
      const sessionTargetingMatch = await evaluateTargetingAndStore({
        sessionId: 123,
        loggerProvider: config.loggerProvider,
        apiKey: config.apiKey,
        targetingConfig: flagConfig,
        targetingParams: { page: { url: 'https://example.com/analytics' } },
        diagnosticsClient,
        deviceId: 'dev-1',
      });
      // Best-effort: still resolves true (default match) even when the engine throws.
      expect(sessionTargetingMatch).toBe(true);
      expect(diagnosticsClient.increment).toHaveBeenCalledWith('sr.trc.eval.error');
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.eval.error',
        expect.objectContaining({
          sessionId: 123,
          deviceId: 'dev-1',
          srId: 'dev-1/123',
          pageUrl: 'https://example.com/analytics',
          message: 'engine boom',
        }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith('engine boom');
    });

    test('should parse string sessionId to number when calling evaluateTargeting', async () => {
      jest.spyOn(targetingIDBStore, 'getTargetingMatchForSession').mockResolvedValueOnce(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      (evaluateTargeting as jest.Mock).mockResolvedValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const sessionTargetingMatch = await evaluateTargetingAndStore({
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
      expect(sessionTargetingMatch).toBe(true);
    });
  });
});
