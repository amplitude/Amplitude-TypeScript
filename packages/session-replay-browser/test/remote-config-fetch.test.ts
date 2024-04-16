import { Logger } from '@amplitude/analytics-types';
import * as Targeting from '@amplitude/targeting';
import { SessionReplayConfig } from '../src/config';
import { SessionReplayRemoteConfigFetch } from '../src/remote-config-fetch';
import { SessionReplaySessionIDBStore } from '../src/session-idb-store';
import { SessionReplayRemoteConfig } from '../src/typings/session-replay';
import { flagConfig } from './flag-config-data';

type MockedLogger = jest.Mocked<Logger>;

jest.mock('@amplitude/targeting');
type MockedTargeting = jest.Mocked<typeof import('@amplitude/targeting')>;

const mockRemoteConfig: SessionReplayRemoteConfig = {
  sr_targeting_config: flagConfig,
};

async function runScheduleTimers() {
  // exhause first setTimeout
  jest.runAllTimers();
  // wait for next tick to call nested setTimeout
  await Promise.resolve();
  // exhause nested setTimeout
  jest.runAllTimers();
}

describe('SessionReplayRemoteConfigFetch', () => {
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
  let config: SessionReplayConfig;
  let sessionIDBStore: SessionReplaySessionIDBStore;
  beforeEach(() => {
    config = new SessionReplayConfig('static_key', {
      loggerProvider: mockLoggerProvider,
      sampleRate: 1,
    });
    sessionIDBStore = new SessionReplaySessionIDBStore({
      loggerProvider: config.loggerProvider,
      apiKey: config.apiKey,
    });
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

  describe('getRemoteConfig', () => {
    let remoteConfigFetch: SessionReplayRemoteConfigFetch;
    let fetchMock: jest.Mock;
    let idbRemoteConfigMock: jest.Mock;
    beforeEach(() => {
      idbRemoteConfigMock = jest.fn().mockResolvedValue(mockRemoteConfig);
      sessionIDBStore.getRemoteConfigForSession = idbRemoteConfigMock;
      remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config, sessionIDBStore });
      fetchMock = jest.fn();
      remoteConfigFetch.fetchRemoteConfig = fetchMock;
    });
    test('should return remote config from memory if it exists', async () => {
      remoteConfigFetch.remoteConfig = mockRemoteConfig;

      const remoteConfig = await remoteConfigFetch.getRemoteConfig(123);
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    test('should return remote config from indexedDB if it exists, and no config in memory', async () => {
      const remoteConfig = await remoteConfigFetch.getRemoteConfig(123);
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(idbRemoteConfigMock).toHaveBeenCalled();
    });
    test('should call fetchRemoteConfig if no config exists in memory or indexeddb', async () => {
      idbRemoteConfigMock = jest.fn().mockResolvedValue(undefined);
      sessionIDBStore.getRemoteConfigForSession = idbRemoteConfigMock;
      fetchMock.mockResolvedValue(mockRemoteConfig);

      const remoteConfig = await remoteConfigFetch.getRemoteConfig(123);
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getTargetingConfig', () => {
    test('should return sr_targeting_config from remote config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config, sessionIDBStore });
      remoteConfigFetch.getRemoteConfig = jest.fn().mockResolvedValue(mockRemoteConfig);
      const targetingConfig = await remoteConfigFetch.getTargetingConfig(123);
      expect(targetingConfig).toEqual(flagConfig);
    });
    test('should return undefined if no remote config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config, sessionIDBStore });
      remoteConfigFetch.getRemoteConfig = jest.fn().mockResolvedValue(undefined);
      const targetingConfig = await remoteConfigFetch.getTargetingConfig(123);
      expect(targetingConfig).toEqual(undefined);
    });
  });

  describe('fetchRemoteConfig', () => {
    let remoteConfigFetch: SessionReplayRemoteConfigFetch;
    let storeRemoteConfigMock: jest.Mock;
    beforeEach(() => {
      storeRemoteConfigMock = jest.fn();
      sessionIDBStore.storeRemoteConfigForSession = storeRemoteConfigMock;
      remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config, sessionIDBStore });
    });
    test('should fetch and return config', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        }),
      );
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      return fetchPromise.then((remoteConfig) => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual('Session replay remote config successfully fetched');
        expect(remoteConfig).toEqual(mockRemoteConfig);
        expect(remoteConfigFetch.attempts).toBe(0);
      });
    });
    test('should fetch and set config in memory', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        }),
      );
      // Ensure remote config has not been set yet
      expect(remoteConfigFetch.remoteConfig).toEqual(undefined);
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(remoteConfigFetch.remoteConfig).toEqual(mockRemoteConfig);
      });
    });
    test('should fetch and set config in indexedDB', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        }),
      );
      // Ensure remote config has not been set yet
      expect(remoteConfigFetch.remoteConfig).toEqual(undefined);
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(storeRemoteConfigMock).toHaveBeenCalledWith(123, mockRemoteConfig);
      });
    });
    test('should handle unexpected error', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('API Failure');
          expect(remoteConfigFetch.attempts).toBe(0);
        });
    });
    test('should not retry for 400 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 400,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Error: Network error occurred, session replay remote config fetch failed');
          expect(remoteConfigFetch.attempts).toBe(0);
        });
    });
    test('should not retry for 413 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 413,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
            json: () => mockRemoteConfig,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Error: Network error occurred, session replay remote config fetch failed');
          expect(remoteConfigFetch.attempts).toBe(0);
        });
    });
    test('should handle retry for 500 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
            json: () => mockRemoteConfig,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(remoteConfigFetch.attempts).toBe(0);
      });
    });

    test('should only retry less than flushMaxRetries for 500 error', async () => {
      // Set overall mock implementation, so it returns 500 repeatedly
      (fetch as jest.Mock).mockImplementation(() => {
        return Promise.resolve({
          status: 500,
        });
      });
      remoteConfigFetch.config.flushMaxRetries = 2;
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(2);
          expect(err.message).toEqual('Network error occurred, session replay remote config fetch failed');
          expect(remoteConfigFetch.attempts).toBe(0);
        });
    });
    test('should handle retry for 503 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 503,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
            json: () => mockRemoteConfig,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(remoteConfigFetch.attempts).toBe(0);
      });
    });
    test('should handle unexpected error where fetch response is null', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve(null);
      });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Error: Unexpected error occurred');
          expect(remoteConfigFetch.attempts).toBe(0);
        });
    });
  });

  describe('evaluateTargeting', () => {
    let remoteConfigFetch: SessionReplayRemoteConfigFetch;
    let storeTargetingMatchForSessionMock: jest.Mock;
    let getTargetingMatchForSessionMock: jest.Mock;
    let getTargetingConfigMock: jest.Mock;
    beforeEach(() => {
      storeTargetingMatchForSessionMock = jest.fn();
      getTargetingMatchForSessionMock = jest.fn();
      getTargetingConfigMock = jest.fn();
      sessionIDBStore.storeRemoteConfigForSession = storeTargetingMatchForSessionMock;
      sessionIDBStore.getTargetingMatchForSession = getTargetingMatchForSessionMock;
      remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config, sessionIDBStore });
    });
    test('should do nothing if sessionTargetingMatch is true', async () => {
      remoteConfigFetch.sessionTargetingMatch = true;
      await remoteConfigFetch.evaluateTargeting({ sessionId: 123 });
      expect(getTargetingMatchForSessionMock).not.toHaveBeenCalled();
    });
    test('should return a true match from IndexedDB', async () => {
      remoteConfigFetch.sessionTargetingMatch = false;
      getTargetingMatchForSessionMock.mockResolvedValueOnce(true);
      await remoteConfigFetch.evaluateTargeting({ sessionId: 123 });
      expect(getTargetingMatchForSessionMock).toHaveBeenCalled();
      expect(getTargetingConfigMock).not.toHaveBeenCalled();
      expect(remoteConfigFetch.sessionTargetingMatch).toBe(true);
    });

    test('should fetch remote config and use it to determine targeting match', async () => {
      remoteConfigFetch.sessionTargetingMatch = false;
      getTargetingConfigMock.mockResolvedValueOnce(flagConfig);
      remoteConfigFetch.getTargetingConfig = getTargetingConfigMock;
      evaluateTargeting.mockReturnValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
      };
      await remoteConfigFetch.evaluateTargeting({
        sessionId: 123,
        deviceId: '1a2b3c',
        userProperties: mockUserProperties,
      });
      expect(evaluateTargeting).toHaveBeenCalledWith({
        flag: flagConfig,
        sessionId: 123,
        deviceId: '1a2b3c',
        userProperties: mockUserProperties,
      });
      expect(remoteConfigFetch.sessionTargetingMatch).toBe(true);
    });
    test('should set sessionTargetingMatch to true if no targeting config returned', async () => {
      getTargetingConfigMock = jest.fn().mockResolvedValue(undefined);
      remoteConfigFetch.getTargetingConfig = getTargetingConfigMock;
      await remoteConfigFetch.evaluateTargeting({ sessionId: 123 });
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(remoteConfigFetch.sessionTargetingMatch).toBe(true);
    });
    test('should set sessionTargetingMatch to true if targeting config returned as empty object', async () => {
      getTargetingConfigMock = jest.fn().mockResolvedValue({});
      remoteConfigFetch.getTargetingConfig = getTargetingConfigMock;
      await remoteConfigFetch.evaluateTargeting({ sessionId: 123 });
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(remoteConfigFetch.sessionTargetingMatch).toBe(true);
    });
    test('should not update sessionTargetingMatch getTargetingConfig throws error', async () => {
      expect(remoteConfigFetch.sessionTargetingMatch).toBe(false);
      getTargetingConfigMock = jest.fn().mockImplementation(() => {
        throw new Error();
      });
      await remoteConfigFetch.evaluateTargeting({ sessionId: 123 });
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(remoteConfigFetch.sessionTargetingMatch).toBe(false);
    });
  });
});
