/**
 * On-device harness for offline queueing / reconnect flush.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * Connectivity flips are simulated via DeviceEventEmitter (same bus NativeEventEmitter
 * listens on). A custom transport captures what would be uploaded.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from 'react-native-harness';
import { DeviceEventEmitter } from 'react-native';
import {
  MemoryStorage,
  STORAGE_PREFIX,
  Status,
  type Event,
  type Payload,
  type Response,
  type Transport,
} from '@amplitude/analytics-core';
import { createInstance, Types } from '@amplitude/analytics-react-native';

const API_KEY = 'dummyApiKey';
const CONNECTIVITY_EVENT_NAME = 'AmplitudeNetworkConnectivityChanged';
const STORAGE_KEY = `${STORAGE_PREFIX}_${API_KEY.substring(0, 10)}`;

function emitConnectivity(isConnected: boolean) {
  DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected });
}

async function waitForQueuedEvents(
  storage: MemoryStorage<Event[]>,
  minCount: number,
  timeoutMs = 3000,
): Promise<Event[]> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const queued = (await storage.get(STORAGE_KEY)) ?? [];
    if (queued.length >= minCount) {
      return queued;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const queued = (await storage.get(STORAGE_KEY)) ?? [];
  throw new Error(
    `Timed out waiting for ${minCount} queued events; got ${queued.length}: ${queued
      .map((e) => e.event_type)
      .join(', ')}`,
  );
}

async function waitForSentEvents(sentEvents: Event[], eventTypes: string[], timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const types = sentEvents.map((e) => e.event_type);
    if (eventTypes.every((type) => types.includes(type))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for sent events [${eventTypes.join(', ')}]; got [${sentEvents
      .map((e) => e.event_type)
      .join(', ')}]`,
  );
}

describe('network connectivity', () => {
  it('queues offline events in storage and flushes them on reconnect', async () => {
    const sentEvents: Event[] = [];
    const transportProvider: Transport = {
      send: async (_serverUrl: string, payload: Payload): Promise<Response> => {
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
      },
    };
    const storageProvider = new MemoryStorage<Event[]>();

    const client = createInstance();
    await client.init(API_KEY, 'harness-user', {
      transportProvider,
      storageProvider,
      flushQueueSize: 1,
      flushIntervalMillis: 100,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
      autocapture: {
        appLifecycles: false,
        sessions: false,
      },
    } as any).promise;

    // 1. Track while online — should upload immediately.
    const onlineResult = await client.track('event_online_1').promise;
    expect(onlineResult.code).toBe(200);
    await waitForSentEvents(sentEvents, ['event_online_1']);

    // 2. Simulate offline.
    emitConnectivity(false);

    // 3. Track while offline (promise resolves only after flush on reconnect).
    void client.track('event_offline_2').promise;

    // 4. Offline event should be persisted; nothing new sent yet.
    const queued = await waitForQueuedEvents(storageProvider, 1);
    expect(queued.some((e) => e.event_type === 'event_offline_2')).toBe(true);
    expect(sentEvents.map((e) => e.event_type)).toEqual(['event_online_1']);

    // 5. Go online again — connectivity plugin flushes the queue.
    emitConnectivity(true);

    // 6. Track a third event after reconnect.
    void client.track('event_online_3').promise;

    // 7. All three events should have been uploaded; storage should drain.
    await waitForSentEvents(sentEvents, ['event_online_1', 'event_offline_2', 'event_online_3']);
    const sentTypes = sentEvents.map((e) => e.event_type);
    expect(sentTypes.includes('event_online_1')).toBe(true);
    expect(sentTypes.includes('event_offline_2')).toBe(true);
    expect(sentTypes.includes('event_online_3')).toBe(true);

    const remaining = (await storageProvider.get(STORAGE_KEY)) ?? [];
    expect(remaining).toEqual([]);
  });
});
