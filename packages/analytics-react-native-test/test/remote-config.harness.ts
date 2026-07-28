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
import { Types } from '@amplitude/analytics-react-native';
import { AmplitudeReactNative } from '@amplitude/analytics-react-native/src/react-native-client';
import { Status, type Payload, type Response as AmplitudeResponse, type Transport } from '@amplitude/analytics-core';

const API_KEY = 'remoteConfigHarnessApiKey';
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
        `${REMOTE_CONFIG_SERVER_URL}/${encodeURIComponent(API_KEY)}?config_group=browser`,
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
