/* eslint-disable @typescript-eslint/unbound-method */
import { NativeModules, DeviceEventEmitter } from 'react-native';
import { MemoryStorage, Status, Event, Payload, Transport, Response, STORAGE_PREFIX } from '@amplitude/analytics-core';
import { AmplitudeReactNative } from '../../src/react-native-client';
import { CONNECTIVITY_EVENT_NAME } from '../../src/plugins/network-connectivity-checker';
import * as CookieMigration from '../../src/cookie-migration';

/**
 * End-to-end style test: with the connectivity plugin installed by default,
 * events queue while `config.offline === true` (Destination short-circuits both
 * schedule and flush) and are flushed once connectivity is restored.
 */
describe('offline mode integration', () => {
  const API_KEY = 'API_KEY';

  const connectivityModule = NativeModules.AmplitudeReactNativeConnectivity as {
    getNetworkConnectivityStatus: jest.Mock;
  };

  afterEach(() => {
    jest.clearAllMocks();
    connectivityModule.getNetworkConnectivityStatus.mockResolvedValue({ isConnected: true });
    DeviceEventEmitter.removeAllListeners(CONNECTIVITY_EVENT_NAME);
  });

  test('queues events while offline and flushes them on reconnect', async () => {
    jest.spyOn(CookieMigration, 'parseOldCookies').mockResolvedValueOnce({ optOut: false });

    const sentEvents: Event[] = [];
    const send = jest.fn(async (_serverUrl: string, payload: Payload): Promise<Response> => {
      sentEvents.push(...payload.events);
      return {
        status: Status.Success,
        statusCode: 200,
        body: {
          eventsIngested: payload.events.length,
          payloadSizeBytes: 0,
          serverUploadTime: 0,
        },
      };
    });
    const transportProvider: Transport = { send };
    const storageProvider = new MemoryStorage<Event[]>();

    const client = new AmplitudeReactNative();
    await client.init(API_KEY, undefined, {
      transportProvider,
      storageProvider,
      flushIntervalMillis: 3000,
      flushQueueSize: 100,
      attribution: { disabled: true },
      optOut: false,
    }).promise;

    // Go offline via the native connectivity signal.
    DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: false });

    // Track events while offline; their promises won't resolve until flushed,
    // so don't await them here.
    void client.track('event_while_offline_1').promise;
    void client.track('event_while_offline_2').promise;

    // Allow the events to be enqueued and persisted to storage.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Nothing is sent while offline, and the queue is persisted.
    await client.flush().promise;
    expect(send).not.toHaveBeenCalled();
    const queued = await storageProvider.get(`${STORAGE_PREFIX}_${API_KEY.substring(0, 10)}`);
    expect(queued?.length).toBe(2);

    // Reconnect → plugin flips config.offline=false and flushes immediately.
    DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });
    await client.flush().promise;

    expect(send).toHaveBeenCalled();
    expect(sentEvents.map((e) => e.event_type)).toEqual(
      expect.arrayContaining(['event_while_offline_1', 'event_while_offline_2']),
    );

    // Storage queue drains after a successful flush.
    const remaining = await storageProvider.get(`${STORAGE_PREFIX}_${API_KEY.substring(0, 10)}`);
    expect(remaining ?? []).toEqual([]);

    client.shutdown();
  });
});
