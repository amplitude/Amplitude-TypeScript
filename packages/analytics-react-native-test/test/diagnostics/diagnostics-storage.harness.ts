/**
 * On-device harness for ReactNativeDiagnosticsStorage flushed through DiagnosticsClient.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * The diagnostics service is stood in for by the host mock API
 * (scripts/mock-api-server.mjs, /diagnostics/capture), so the flush goes over a
 * real on-device fetch and the payload is asserted from what the server received.
 *
 * Storage is memory-only on the harness host, which excludes RNCAsyncStorage from
 * native autolinking (SDKRN-8). Flush behavior is identical either way.
 *
 * Requires a current `analytics-core` build (`pnpm build`): the bundle resolves
 * `@amplitude/analytics-core` to lib/, and injectable diagnostics storage is
 * silently ignored by a stale one.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, afterEach } from 'react-native-harness';
import { DiagnosticsClient, Logger } from '@amplitude/analytics-core';
import { ReactNativeDiagnosticsStorage } from '@amplitude/analytics-react-native/src/diagnostics/diagnostics-storage';
import { mockApiUrl } from '../helpers/mock-api';

const API_KEY = 'diagHarnessApiKey';
const DIAGNOSTICS_US_SERVER_URL = 'https://diagnostics.prod.us-west-2.amplitude.com/v1/capture';
const CAPTURE_URL = mockApiUrl('/diagnostics/capture');
const RECORDED_URL = mockApiUrl('/diagnostics/requests');

const logger = new Logger();

interface RecordedRequest {
  headers: Record<string, string>;
  body: string;
}

interface DiagnosticsPayload {
  tags: Record<string, string>;
  counters: Record<string, number>;
  histogram: Record<string, { count: number; min: number; max: number; avg: number }>;
  events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>;
}

type AsyncStorageLike = { removeItem: (key: string) => Promise<void> };

function tryGetAsyncStorage(): AsyncStorageLike | null {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    return ((mod?.default ?? mod) as AsyncStorageLike | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Drop anything persisted so a linked AsyncStorage can't leak between runs. */
async function removeDiagnosticsKey(storageKey: string): Promise<void> {
  try {
    await tryGetAsyncStorage()?.removeItem(storageKey);
  } catch {
    // Native module missing — nothing was persisted.
  }
}

async function readRecordedRequests(): Promise<RecordedRequest[]> {
  const response = await fetch(RECORDED_URL);
  const { requests } = (await response.json()) as { requests: RecordedRequest[] };
  return requests;
}

/** The client fires its POST without awaiting it, so poll the mock server. */
async function waitForRecordedRequests(minCount: number, timeoutMs = 3000): Promise<RecordedRequest[]> {
  const started = Date.now();
  let recorded = await readRecordedRequests();
  while (recorded.length < minCount && Date.now() - started <= timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    recorded = await readRecordedRequests();
  }
  if (recorded.length < minCount) {
    throw new Error(`Timed out waiting for ${minCount} diagnostics request(s); got ${recorded.length}`);
  }
  return recorded;
}

const event = (name: string) => ({ event_name: name, time: 1, event_properties: {} });

describe('diagnostics flush', () => {
  const storages: ReactNativeDiagnosticsStorage[] = [];
  const clients: DiagnosticsClient[] = [];

  /** Points the client at the mock endpoint after asserting the shipped default. */
  const createClientWithStorage = async () => {
    const storage = new ReactNativeDiagnosticsStorage(API_KEY, logger);
    storages.push(storage);
    // Recent timestamp so the client does not flush while being constructed.
    await storage.setLastFlushTimestamp(Date.now());

    const client = new DiagnosticsClient(API_KEY, logger, 'US', undefined, storage);
    clients.push(client);
    expect(client.storage).toBe(storage);
    expect(client.serverUrl).toBe(DIAGNOSTICS_US_SERVER_URL);
    client.serverUrl = CAPTURE_URL;

    return { storage, client };
  };

  beforeEach(async () => {
    await fetch(RECORDED_URL, { method: 'DELETE' });
  });

  afterEach(async () => {
    for (const client of clients) {
      if (client.saveTimer) {
        clearTimeout(client.saveTimer);
        client.saveTimer = null;
      }
      if (client.flushTimer) {
        clearTimeout(client.flushTimer);
        client.flushTimer = null;
      }
    }
    clients.length = 0;
    for (const storage of storages) {
      await removeDiagnosticsKey(storage.storageKey);
    }
    storages.length = 0;
  });

  it('kitchen sink test for diagnostics storage', async () => {
    const { storage, client } = await createClientWithStorage();

    await storage.setTags({ library: 'amplitude-react-native-ts/1.0.0', platform: 'ReactNative' });
    await storage.incrementCounters({ 'analytics.error': 2 });
    await storage.incrementCounters({ 'analytics.error': 3, 'network.retry': 1 });
    await storage.setHistogramStats({ 'sr.time': { count: 1, min: 50, max: 50, sum: 50 } });
    await storage.setHistogramStats({ 'sr.time': { count: 2, min: 10, max: 90, sum: 100 } });
    await storage.addEventRecords([event('a'), event('b')]);

    await client._flush();

    const recorded = await waitForRecordedRequests(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].headers['x-apikey']).toBe(API_KEY);
    expect(recorded[0].headers['content-type']).toBe('application/json');

    const payload = JSON.parse(recorded[0].body) as DiagnosticsPayload;
    expect(payload.tags).toEqual({
      library: 'amplitude-react-native-ts/1.0.0',
      platform: 'ReactNative',
    });
    expect(payload.counters).toEqual({ 'analytics.error': 5, 'network.retry': 1 });
    // avg is derived from the accumulated sum: 150 / 3.
    expect(payload.histogram).toEqual({ 'sr.time': { count: 3, min: 10, max: 90, avg: 50 } });
    expect(payload.events.map((e) => e.event_name)).toEqual(['a', 'b']);
  });

  it('does not post when there is nothing to flush', async () => {
    const { client } = await createClientWithStorage();

    await client._flush();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await readRecordedRequests()).toEqual([]);
  });

  it('drops the batch without throwing when the diagnostics endpoint fails', async () => {
    const { storage, client } = await createClientWithStorage();
    client.serverUrl = mockApiUrl('/api/status/500');

    await storage.incrementCounters({ 'analytics.error': 1 });

    await client._flush();

    // The flush drains storage before uploading, so a rejected upload loses the
    // batch rather than retrying it. Asserted to pin the current behavior.
    const { counters } = await storage.getAllAndClear();
    expect(counters).toEqual([]);
    expect(await readRecordedRequests()).toEqual([]);
  });
});
