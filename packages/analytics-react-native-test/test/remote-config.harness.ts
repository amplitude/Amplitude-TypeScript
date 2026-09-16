/**
 * On-device harness for React Native remote configuration.
 *
 * The remote-config request is intercepted in-process so the test does not
 * depend on Amplitude's remote-config service.
 *
 * Event uploads also use `fetch` (via FetchTransport). Provide a no-op
 * `transportProvider` so those do not pollute the remote-config assertions.
 */
import { describe, it, expect } from 'react-native-harness';
import { Platform } from 'react-native';
import { Types } from '@amplitude/analytics-react-native';
import { AmplitudeReactNative } from '@amplitude/analytics-react-native/src/react-native-client';
import {
  MemoryStorage,
  Status,
  type Payload,
  type Response as AmplitudeResponse,
  type StorageData,
  type Transport,
} from '@amplitude/analytics-core';

const API_KEY = 'remoteConfigHarnessApiKey';
const REMOTE_CONFIG_STORAGE_KEY = `AMP_remote_config_${API_KEY.substring(0, 10)}`;
const REMOTE_CONFIG_SERVER_URL = 'https://remote-config.harness.test/config';

const noopTransport: Transport = {
  send: async (_serverUrl: string, payload: Payload): Promise<AmplitudeResponse> => ({
    status: Status.Success,
    statusCode: 200,
    body: {
      eventsIngested: payload.events.length,
      payloadSizeBytes: 0,
      serverUploadTime: 0,
    },
  }),
};

describe('remote config', () => {
  it('fetches and applies remote autocapture config during init', async () => {
    const originalFetch = global.fetch;
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const remoteConfig = {
      configs: {
        analyticsSDK: {
          reactNativeSDK: {
            autocapture: {
              appLifecycles: false,
              sessions: { enabled: true },
              networkTracking: { enabled: true, urls: ['a', 'b', 'c'] },
            },
          },
        },
      },
    };

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return {
        ok: true,
        status: 200,
        json: async () => remoteConfig,
        text: async () => JSON.stringify(remoteConfig),
      } as Response;
    }) as typeof global.fetch;

    try {
      const client = new AmplitudeReactNative();

      await client.init(API_KEY, 'remote-config-user', {
        attribution: {
          disabled: true,
        },
        autocapture: {
          sessions: false,
          networkTracking: true,
          screenViews: true,
          elementInteractions: false,
        },
        flushQueueSize: 100,
        logLevel: Types.LogLevel.None,
        transportProvider: noopTransport,
        remoteConfig: {
          fetchRemoteConfig: true,
          serverUrl: REMOTE_CONFIG_SERVER_URL,
        },
      }).promise;

      expect(requests.length).toBe(1);
      expect(String(requests[0]?.input)).toBe(
        `${REMOTE_CONFIG_SERVER_URL}/${encodeURIComponent(API_KEY)}?config_group=${Platform.OS}`,
      );
      expect(requests[0]?.init?.method).toBe('GET');
      expect(client.getUserId()).toBe('remote-config-user');

      // autocapture params set from remote config
      expect(client.autocapture?.sessions).toBe(true);
      expect(client.autocapture?.networkTracking).toEqual({ urls: ['a', 'b', 'c'] });

      // default autocapture params
      expect(client.autocapture?.screenViews).toBe(true);
      expect(client.autocapture?.elementInteractions).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fetches and applies remote autocapture config during init with custom storage', async () => {
    const originalFetch = global.fetch;
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const remoteConfig = {
      configs: {
        analyticsSDK: {
          reactNativeSDK: {
            autocapture: {
              appLifecycles: false,
              sessions: { enabled: true },
              networkTracking: { enabled: true, urls: ['a', 'b', 'c'] },
            },
          },
        },
      },
    };
    const staleRemoteConfig = {
      configs: {
        analyticsSDK: {
          reactNativeSDK: {
            autocapture: {
              appLifecycles: true,
              sessions: { enabled: false },
              networkTracking: false,
            },
          },
        },
      },
    };
    const storageProvider = new MemoryStorage<StorageData>();
    expect(await storageProvider.isEnabled()).toBe(true);
    await storageProvider.remove(REMOTE_CONFIG_STORAGE_KEY);
    const initOptions = {
      attribution: {
        disabled: true,
      },
      autocapture: {
        sessions: false,
        networkTracking: true,
        screenViews: true,
        elementInteractions: false,
      },
      flushQueueSize: 100,
      logLevel: Types.LogLevel.None,
      transportProvider: noopTransport,
      storageProvider,
      remoteConfig: {
        fetchRemoteConfig: true,
        serverUrl: REMOTE_CONFIG_SERVER_URL,
      },
    };

    const mockFetch = (body: unknown, delayMs = 0) => {
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, init });
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }) as typeof global.fetch;
    };

    mockFetch(remoteConfig);

    try {
      const client = new AmplitudeReactNative();

      await client.init(API_KEY, 'remote-config-user', initOptions).promise;

      const cached = await storageProvider.get(REMOTE_CONFIG_STORAGE_KEY);
      expect(cached?.remoteConfig).toEqual(remoteConfig);

      requests.length = 0;
      // Delay the second fetch so cache wins RemoteConfigClient 'all' delivery mode.
      mockFetch(staleRemoteConfig, 250);

      const cachedClient = new AmplitudeReactNative();
      await cachedClient.init(API_KEY, 'remote-config-user', initOptions).promise;

      expect(requests.length).toBe(1);
      expect(cachedClient.autocapture?.sessions).toBe(true);
      expect(cachedClient.autocapture?.networkTracking).toEqual({ urls: ['a', 'b', 'c'] });
      expect(cachedClient.autocapture?.screenViews).toBe(true);
      expect(cachedClient.autocapture?.elementInteractions).toBe(false);
    } finally {
      global.fetch = originalFetch;
      await storageProvider.remove(REMOTE_CONFIG_STORAGE_KEY);
    }
  });

  it('fetches platform diagnostics config during init', async () => {
    const originalFetch = global.fetch;
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const remoteConfig = {
      configs: {
        diagnostics: {
          [`${Platform.OS}SDK`]: {
            sampleRate: 1,
          },
        },
      },
    };

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return {
        ok: true,
        status: 200,
        json: async () => remoteConfig,
        text: async () => JSON.stringify(remoteConfig),
      } as Response;
    }) as typeof global.fetch;

    try {
      const client = new AmplitudeReactNative();

      await client.init(API_KEY, 'remote-config-user', {
        attribution: {
          disabled: true,
        },
        flushQueueSize: 100,
        logLevel: Types.LogLevel.None,
        transportProvider: noopTransport,
        remoteConfig: {
          fetchRemoteConfig: true,
          serverUrl: REMOTE_CONFIG_SERVER_URL,
        },
      }).promise;

      expect(requests.length).toBe(1);
      expect(String(requests[0]?.input)).toBe(
        `${REMOTE_CONFIG_SERVER_URL}/${encodeURIComponent(API_KEY)}?config_group=${Platform.OS}`,
      );
      expect(requests[0]?.init?.method).toBe('GET');
      expect(client.getUserId()).toBe('remote-config-user');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not fetch remote autocapture config if fetchRemoteConfig is false', async () => {
    const originalFetch = global.fetch;
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '{}',
      } as Response;
    }) as typeof global.fetch;

    try {
      const client = new AmplitudeReactNative();
      await client.init(API_KEY, 'remote-config-user', {
        attribution: {
          disabled: true,
        },
        autocapture: {
          sessions: false,
          networkTracking: true,
          screenViews: true,
          elementInteractions: false,
        },
        flushQueueSize: 100,
        logLevel: Types.LogLevel.None,
        transportProvider: noopTransport,
        remoteConfig: {
          fetchRemoteConfig: false,
          serverUrl: REMOTE_CONFIG_SERVER_URL,
        },
      }).promise;

      expect(requests.length).toBe(0);
      expect(client.getUserId()).toBe('remote-config-user');
      expect(client.autocapture?.sessions).toBe(false);
      expect(client.autocapture?.networkTracking).toBe(true);
      expect(client.autocapture?.screenViews).toBe(true);
      expect(client.autocapture?.elementInteractions).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
