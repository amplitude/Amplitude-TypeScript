import { Logger } from '@amplitude/analytics-types';
import { SessionReplayLocalConfig } from '../../src/config/local-config';
import { SessionReplayRemoteConfigFetch } from '../../src/config/remote-config';
import { SessionReplayRemoteConfig } from '../../src/config/types';
import { SessionReplaySessionIDBStore } from '../../src/session-idb-store';

type MockedLogger = jest.Mocked<Logger>;
const samplingConfig = {
  sample_rate: 0.4,
  capture_enabled: true,
};
const mockRemoteConfig: SessionReplayRemoteConfig = {
  sr_sampling_config: samplingConfig,
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
  let originalFetch: typeof global.fetch;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  let localConfig: SessionReplayLocalConfig;
  let sessionIDBStore: SessionReplaySessionIDBStore;
  beforeEach(() => {
    localConfig = new SessionReplayLocalConfig('static_key', {
      loggerProvider: mockLoggerProvider,
      sampleRate: 1,
    });
    sessionIDBStore = new SessionReplaySessionIDBStore({
      loggerProvider: localConfig.loggerProvider,
      apiKey: localConfig.apiKey,
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
      remoteConfigFetch = new SessionReplayRemoteConfigFetch({ localConfig, sessionIDBStore });
      fetchMock = jest.fn();
      remoteConfigFetch.fetchRemoteConfig = fetchMock;
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

  describe('getSamplingConfig', () => {
    test('should return sr_targeting_config from remote config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ localConfig, sessionIDBStore });
      remoteConfigFetch.getRemoteConfig = jest.fn().mockResolvedValue(mockRemoteConfig);
      const result = await remoteConfigFetch.getSamplingConfig(123);
      expect(result).toEqual(samplingConfig);
    });
    test('should return undefined if no remote config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ localConfig, sessionIDBStore });
      remoteConfigFetch.getRemoteConfig = jest.fn().mockResolvedValue(undefined);
      const result = await remoteConfigFetch.getSamplingConfig(123);
      expect(result).toEqual(undefined);
    });
  });

  describe('fetchRemoteConfig', () => {
    let remoteConfigFetch: SessionReplayRemoteConfigFetch;
    let storeRemoteConfigMock: jest.Mock;
    beforeEach(() => {
      storeRemoteConfigMock = jest.fn();
      sessionIDBStore.storeRemoteConfigForSession = storeRemoteConfigMock;
      remoteConfigFetch = new SessionReplayRemoteConfigFetch({ localConfig, sessionIDBStore });
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
        expect(remoteConfigFetch.attempts).toBe(1);
      });
    });
    test('should fetch and set config in indexedDB', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        }),
      );
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
          expect(remoteConfigFetch.attempts).toBe(1);
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
          expect(remoteConfigFetch.attempts).toBe(1);
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
          expect(remoteConfigFetch.attempts).toBe(1);
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
        expect(remoteConfigFetch.attempts).toBe(2);
      });
    });

    test('should only retry up to flushMaxRetries for 500 error', async () => {
      // Set overall mock implementation, so it returns 500 repeatedly
      (fetch as jest.Mock).mockImplementation(() => {
        return Promise.resolve({
          status: 500,
        });
      });
      remoteConfigFetch.localConfig.flushMaxRetries = 2;
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);

      // Need to run 3x to get through all setTimeout calls
      await runScheduleTimers();
      await runScheduleTimers();
      await runScheduleTimers();

      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(2);
          expect(err.message).toEqual('Session replay remote config fetch rejected due to exceeded retry count');
          expect(remoteConfigFetch.attempts).toBe(2);
        });
    });
    test('should reset attempts when new sessionId', async () => {
      // Set overall mock implementation, so it returns 500 repeatedly
      (fetch as jest.Mock).mockImplementation(() => {
        return Promise.resolve({
          status: 500,
        });
      });
      remoteConfigFetch.localConfig.flushMaxRetries = 1;
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(123);

      await runScheduleTimers();
      try {
        await fetchPromise;
      } catch (e) {
        // Error is expected, let's swallow it and move on
      }

      expect(remoteConfigFetch.attempts).toBe(1);

      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        });
      });

      const fetchPromiseNextSession = remoteConfigFetch.fetchRemoteConfig(456);

      return fetchPromiseNextSession.finally(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(remoteConfigFetch.attempts).toBe(1);
        expect(remoteConfigFetch.lastFetchedSessionId).toBe(456);
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
        expect(remoteConfigFetch.attempts).toBe(2);
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
          expect(remoteConfigFetch.attempts).toBe(1);
        });
    });
  });
});
