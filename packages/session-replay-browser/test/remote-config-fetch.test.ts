import { Logger } from '@amplitude/analytics-types';
import { SessionReplayConfig } from '../src/config';
import { UNEXPECTED_ERROR_MESSAGE } from '../src/messages';
import { SessionReplayRemoteConfigFetch } from '../src/remote-config-fetch';
import { SessionReplayRemoteConfig } from '../src/typings/session-replay';
import { flagConfig } from './flag-config-data';

type MockedLogger = jest.Mocked<Logger>;

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
  beforeEach(() => {
    config = new SessionReplayConfig('static_key', {
      loggerProvider: mockLoggerProvider,
      sampleRate: 1,
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
    test('should return remote config from memory if it exists', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      remoteConfigFetch.remoteConfig = mockRemoteConfig;
      const fetchMock = jest.fn();
      remoteConfigFetch.fetchRemoteConfig = fetchMock;

      const remoteConfig = await remoteConfigFetch.getRemoteConfig();
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    test('should call fetchRemoteConfig if no config exists in memory', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });

      const fetchMock = jest.fn().mockResolvedValueOnce(mockRemoteConfig);
      remoteConfigFetch.fetchRemoteConfig = fetchMock;

      const remoteConfig = await remoteConfigFetch.getRemoteConfig();
      expect(remoteConfig).toEqual(mockRemoteConfig);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getTargetingConfig', () => {
    test('should return sr_targeting_config from remote config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      remoteConfigFetch.getRemoteConfig = jest.fn().mockResolvedValue(mockRemoteConfig);
      const targetingConfig = await remoteConfigFetch.getTargetingConfig();
      expect(targetingConfig).toEqual(flagConfig);
    });
    test('should return undefined if no remote config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      remoteConfigFetch.getRemoteConfig = jest.fn().mockResolvedValue(undefined);
      const targetingConfig = await remoteConfigFetch.getTargetingConfig();
      expect(targetingConfig).toEqual(undefined);
    });
  });

  describe('fetchRemoteConfig', () => {
    test('should fetch and return config', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        }),
      );
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then((remoteConfig) => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual('Session replay remote config successfully fetched');
        expect(remoteConfig).toEqual(mockRemoteConfig);
      });
    });
    test('should fetch and set config in memory', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      (fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => mockRemoteConfig,
        }),
      );
      // Ensure remote config has not been set yet
      expect(remoteConfigFetch.remoteConfig).toEqual(undefined);
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual('Session replay remote config successfully fetched');
        expect(remoteConfigFetch.remoteConfig).toEqual(mockRemoteConfig);
        expect(remoteConfigFetch.attempts).toBe(0);
      });
    });
    test('should handle unexpected error', async () => {
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('API Failure');
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
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
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
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
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
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
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
      config.flushMaxRetries = 2;
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
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
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
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
      const remoteConfigFetch = new SessionReplayRemoteConfigFetch({ config });
      const fetchPromise = remoteConfigFetch.fetchRemoteConfig();
      await runScheduleTimers();
      return fetchPromise.then(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(UNEXPECTED_ERROR_MESSAGE);
        expect(remoteConfigFetch.attempts).toBe(0);
      });
    });
  });
});
