import { Config } from '@amplitude/analytics-core';
import { Config as IConfig, Logger, ServerZone } from '@amplitude/analytics-types';
import {
  REMOTE_CONFIG_SERVER_URL,
  REMOTE_CONFIG_SERVER_URL_EU,
  REMOTE_CONFIG_SERVER_URL_STAGING,
  RemoteConfigFetch,
  createRemoteConfigFetch,
} from '../src/remote-config';
import * as RemoteConfigAPIStore from '../src/remote-config-idb-store';
import { ConfigNamespace, RemoteConfig, RemoteConfigAPIResponse } from '../src/types';
// import { RemoteConfigFetch as IRemoteConfigFetch } from '../src/types';

type MockedLogger = jest.Mocked<Logger>;
const samplingConfig = {
  sample_rate: 0.4,
  capture_enabled: true,
};
const mockRemoteConfig: RemoteConfig = {
  sr_sampling_config: samplingConfig,
};

const mockRemoteConfigAPIResponse: RemoteConfigAPIResponse = {
  configs: {
    sessionReplay: mockRemoteConfig,
  },
};

async function runScheduleTimers() {
  // exhause first setTimeout
  jest.runAllTimers();
  // wait for next tick to call nested setTimeout
  await Promise.resolve();
  // exhause nested setTimeout
  jest.runAllTimers();
}

describe('RemoteConfigFetch', () => {
  let originalFetch: typeof global.fetch;
  let originalAbortController: typeof global.AbortController;
  const abortMock = jest.fn();
  const mockSignal = {
    aborted: false,
  } as AbortSignal;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  let localConfig: IConfig;
  const mockConfigStore = {
    storeRemoteConfig: jest.fn(),
    getLastFetchedSessionId: jest.fn().mockResolvedValue(123),
    getRemoteConfig: jest.fn().mockResolvedValue(mockRemoteConfig),
  };

  let remoteConfigFetch: RemoteConfigFetch;
  let fetchMock: jest.Mock;
  async function initialize(config = localConfig) {
    remoteConfigFetch = new RemoteConfigFetch({ localConfig: config, configKeys: [ConfigNamespace.SESSION_REPLAY] });
    await remoteConfigFetch.initialize();
    fetchMock = jest.fn();
    remoteConfigFetch.fetchWithTimeout = fetchMock;
    fetchMock.mockResolvedValue(mockRemoteConfigAPIResponse);
  }
  beforeEach(() => {
    jest.spyOn(RemoteConfigAPIStore, 'createRemoteConfigIDBStore').mockResolvedValue(mockConfigStore);
    localConfig = new Config({
      loggerProvider: mockLoggerProvider,
      apiKey: 'static_key',
      transportProvider: { send: async () => null },
    });
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
    global.AbortController = jest.fn(() => {
      return {
        abort: abortMock,
        signal: mockSignal,
      };
    });
  });
  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;
    global.AbortController = originalAbortController;

    jest.useRealTimers();
  });

  describe('getRemoteConfig', () => {
    beforeEach(async () => {
      await initialize();
    });
    test('should return remote config from indexedDB if it exists and matches session id', async () => {
      const remoteConfig = await remoteConfigFetch.getRemoteConfig(
        ConfigNamespace.SESSION_REPLAY,
        'sr_sampling_config',
        123,
      );
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockConfigStore.getRemoteConfig).toHaveBeenCalled();
    });
    test('should call fetchWithTimeout if lastFetchedSessionId does not match session id', async () => {
      const remoteConfig = await remoteConfigFetch.getRemoteConfig(
        ConfigNamespace.SESSION_REPLAY,
        'sr_sampling_config',
        456,
      );
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
    test('should call fetchWithTimeout if remoteConfigIDBStore is not defined', async () => {
      remoteConfigFetch.remoteConfigIDBStore = undefined;
      const remoteConfig = await remoteConfigFetch.getRemoteConfig(
        ConfigNamespace.SESSION_REPLAY,
        'sr_sampling_config',
        456,
      );
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
    test('should call fetchWithTimeout if lastFetchedSessionId is undefined', async () => {
      mockConfigStore.getLastFetchedSessionId = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(RemoteConfigAPIStore, 'createRemoteConfigIDBStore').mockResolvedValueOnce(mockConfigStore);
      await initialize();
      const remoteConfig = await remoteConfigFetch.getRemoteConfig(
        ConfigNamespace.SESSION_REPLAY,
        'sr_sampling_config',
        123,
      );
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
    test('should call fetchWithTimeout if sessionId is undefined', async () => {
      const remoteConfig = await remoteConfigFetch.getRemoteConfig(
        ConfigNamespace.SESSION_REPLAY,
        'sr_sampling_config',
      );
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
    test('should call fetchWithTimeout if no config exists in memory or indexeddb', async () => {
      mockConfigStore.getRemoteConfig = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(RemoteConfigAPIStore, 'createRemoteConfigIDBStore').mockResolvedValue(mockConfigStore);
      await initialize();

      const remoteConfig = await remoteConfigFetch.getRemoteConfig(
        ConfigNamespace.SESSION_REPLAY,
        'sr_sampling_config',
        123,
      );
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('fetchRemoteConfig', () => {
    beforeEach(async () => {
      await initialize();
    });
    test('should fetch and return config', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfigAPIResponse,
        }),
      );
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
      await runScheduleTimers();
      return fetchPromise.then((remoteConfig) => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual('Remote config successfully fetched');
        expect(remoteConfig).toEqual(mockRemoteConfigAPIResponse);
        expect(remoteConfigFetch.attempts).toBe(1);
      });
    });
    test('should fetch and set config in indexedDB', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfigAPIResponse,
        }),
      );
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(mockConfigStore.storeRemoteConfig).toHaveBeenCalledWith(mockRemoteConfigAPIResponse, 123);
      });
    });
    test('should handle unexpected error', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('API Failure')));
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
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
    test('should handle timeout error', async () => {
      const signalToAbort = {
        aborted: false,
      };
      (fetch as jest.Mock).mockImplementationOnce(() => {
        signalToAbort.aborted = true;
        return Promise.reject(new Error('API Failure'));
      });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(signalToAbort as AbortSignal, 123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Remote config fetch rejected due to timeout after 5 seconds');
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
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Network error occurred, remote config fetch failed');
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
            json: () => mockRemoteConfigAPIResponse,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Network error occurred, remote config fetch failed');
          expect(remoteConfigFetch.attempts).toBe(1);
        });
    });
    test('should return early if signal has been aborted', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 500,
        });
      });
      const abortedMockSignal = {
        aborted: true,
      } as AbortSignal;
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(abortedMockSignal, 123);

      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(0);
          expect(err.message).toEqual('Remote config fetch rejected due to timeout after 5 seconds');
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
            json: () => mockRemoteConfigAPIResponse,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);

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
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);

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
          expect(err.message).toEqual('Remote config fetch rejected due to exceeded retry count');
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
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);

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
          json: () => mockRemoteConfigAPIResponse,
        });
      });

      const fetchPromiseNextSession = remoteConfigFetch.fetchRemoteConfig(mockSignal, 456);

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
            json: () => mockRemoteConfigAPIResponse,
          });
        });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
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
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig(mockSignal, 123);
      await runScheduleTimers();
      let err: Error;
      return fetchPromise
        .catch((e: Error) => {
          err = e;
        })
        .finally(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(err.message).toEqual('Unexpected error occurred');
          expect(remoteConfigFetch.attempts).toBe(1);
        });
    });
  });

  describe('fetchWithTimeout', () => {
    beforeEach(async () => {
      remoteConfigFetch = new RemoteConfigFetch({ localConfig, configKeys: [ConfigNamespace.SESSION_REPLAY] });
      await remoteConfigFetch.initialize();
      const fetchMock = jest.fn();
      remoteConfigFetch.fetchRemoteConfig = fetchMock;
    });
    test('should set up a controller to cancel fetch requests after 5 seconds', async () => {
      remoteConfigFetch.localConfig.flushMaxRetries = 2;
      remoteConfigFetch.fetchRemoteConfig = jest.fn().mockResolvedValue(mockRemoteConfig);
      const fetchPromise = remoteConfigFetch.fetchWithTimeout(123);

      // Need to run 3x to get through all setTimeout calls
      await runScheduleTimers();

      return fetchPromise
        .then((remoteConfigResponse) => {
          expect(remoteConfigResponse).toEqual(mockRemoteConfig);
        })
        .finally(() => {
          expect(remoteConfigFetch.fetchRemoteConfig).toHaveBeenCalledTimes(1);
          expect(abortMock).toHaveBeenCalledTimes(1);
        });
    });
  });

  describe('getServerUrl', () => {
    test('should return us server url if us server zone config set', async () => {
      await initialize();
      expect(remoteConfigFetch.getServerUrl()).toEqual(REMOTE_CONFIG_SERVER_URL);
    });
    test('should return eu server url if eu server zone config set', async () => {
      const config = { ...localConfig, optOut: localConfig.optOut, serverZone: ServerZone.EU };
      await initialize(config);
      expect(remoteConfigFetch.getServerUrl()).toEqual(REMOTE_CONFIG_SERVER_URL_EU);
    });

    test('should return staging server url if staging config set', async () => {
      const config = { ...localConfig, optOut: localConfig.optOut, serverZone: ServerZone.STAGING };
      await initialize(config);
      expect(remoteConfigFetch.getServerUrl()).toEqual(REMOTE_CONFIG_SERVER_URL_STAGING);
    });
  });

  describe('createRemoteConfigFetch', () => {
    test('should create a new RemoteConfigFetch instance and initialize', () => {
      const remoteConfigFetch = createRemoteConfigFetch({ localConfig, configKeys: [ConfigNamespace.SESSION_REPLAY] });
      expect(remoteConfigFetch).toBeDefined();
    });
  });
});
