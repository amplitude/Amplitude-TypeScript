/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import * as AnalyticsCore from '@amplitude/analytics-core';
import { ILogger, LogLevel, RemoteConfig, ServerZone, Source } from '@amplitude/analytics-core';
import * as MsgPack from '@msgpack/msgpack';
import { eventWithTime } from '@amplitude/rrweb-types';
import { IDBFactory } from 'fake-indexeddb';
import { SessionReplayOptions } from 'src/typings/session-replay';
import * as SessionReplayIDB from '../../src/events/events-idb-store';
import { SESSION_REPLAY_SERVER_URL } from '../../src/constants';
import { SessionReplay } from '../../src/session-replay';
import { SESSION_ID_IN_20_SAMPLE } from '../test-data';

type MockedLogger = jest.Mocked<ILogger>;

const mockEvent1: eventWithTime = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};

const mockEvent2: eventWithTime = {
  type: 3,
  data: { source: 2, positions: [{ x: 100, y: 200, id: 1, timeOffset: 0 }] },
  timestamp: 1687358661000,
};

async function runScheduleTimers() {
  await new Promise(process.nextTick);
  jest.runAllTimers();
}

describe('msgpack e2e integration', () => {
  let originalFetch: typeof global.fetch;
  let mockRemoteConfig: RemoteConfig | null;
  let mockRemoteConfigClient: any;
  let mockRecordFunction: jest.Mock & { addCustomEvent: jest.Mock };

  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockGlobalScope = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    document: { hasFocus: () => true },
    indexedDB: new IDBFactory(),
  } as unknown as typeof globalThis;

  const apiKey = 'static_key';

  const mockOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 2,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    optOut: false,
    sampleRate: 1,
    sessionId: SESSION_ID_IN_20_SAMPLE,
    serverZone: ServerZone.US,
    useMessagePack: true,
  };

  const initRemoteConfigClient = () => {
    const subscribeImpl = jest.fn((configKey: string, _mode: string, callback: any) => {
      let filtered: RemoteConfig | null = mockRemoteConfig;
      if (configKey && filtered) {
        filtered = configKey.split('.').reduce((cfg: RemoteConfig | null, key: string) => {
          if (cfg === null) return cfg;
          return key in cfg ? (cfg[key] as RemoteConfig) : null;
        }, filtered);
      }
      return callback(filtered, 'initial' as Source, new Date());
    });
    mockRemoteConfigClient = { subscribe: subscribeImpl };
    jest.spyOn(AnalyticsCore, 'RemoteConfigClient').mockImplementation(() => mockRemoteConfigClient);
  };

  beforeEach(() => {
    mockRemoteConfig = {
      configs: {
        sessionReplay: {
          sr_sampling_config: { sample_rate: 1, capture_enabled: true },
          sr_privacy_config: {},
        },
      },
    };
    initRemoteConfigClient();

    jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new');
    jest.useFakeTimers({ doNotFake: ['nextTick'] });

    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });

    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);

    mockRecordFunction = jest.fn().mockReturnValue(jest.fn()) as jest.Mock & { addCustomEvent: jest.Mock };
    mockRecordFunction.addCustomEvent = jest.fn();
    jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any).mockResolvedValue(mockRecordFunction);
  });

  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  /** Initialise the SDK, emit events via rrweb, flush, and return the captured fetch calls. */
  const runSession = async (events: eventWithTime[], options: SessionReplayOptions = mockOptions) => {
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, options).promise;
    await runScheduleTimers();

    const idbInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock.results[0].value;
    jest.spyOn(idbInstance, 'storeCurrentSequence');

    const recordArg = mockRecordFunction.mock.calls[0][0] as { emit?: (e: eventWithTime) => void };
    for (const event of events) {
      recordArg?.emit?.(event);
    }

    sessionReplay.sendEvents();
    await (idbInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
    await runScheduleTimers();

    return (fetch as jest.Mock).mock.calls;
  };

  test('sends Content-Type: application/x-msgpack', async () => {
    const calls = await runSession([mockEvent1]);
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-msgpack');
  });

  test('body is valid msgpack — decodes back to original events', async () => {
    const calls = await runSession([mockEvent1, mockEvent2]);
    const body = calls[0][1].body as Uint8Array;

    const decoded = MsgPack.decode(body) as { version: number; events: unknown[] };
    expect(decoded.version).toBe(1);
    expect(decoded.events).toHaveLength(2);
    expect(decoded.events[0]).toMatchObject({ type: mockEvent1.type, timestamp: mockEvent1.timestamp });
    expect(decoded.events[1]).toMatchObject({ type: mockEvent2.type, timestamp: mockEvent2.timestamp });
  });

  test('events in payload are raw objects, not JSON strings', async () => {
    const calls = await runSession([mockEvent1]);
    const body = calls[0][1].body as Uint8Array;
    const decoded = MsgPack.decode(body) as { events: unknown[] };

    // Each event must be a plain object, not a string
    expect(typeof decoded.events[0]).toBe('object');
    expect(typeof decoded.events[0]).not.toBe('string');
  });

  test('does not set Content-Encoding (CompressionStream unavailable in Jest/Node)', async () => {
    const calls = await runSession([mockEvent1]);
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBeUndefined();
  });

  test('sends to the correct endpoint with correct query params', async () => {
    const calls = await runSession([mockEvent1]);
    expect(calls[0][0]).toBe(
      `${SESSION_REPLAY_SERVER_URL}?device_id=1a2b3c&session_id=${SESSION_ID_IN_20_SAMPLE}&type=replay`,
    );
  });

  test('on 413, splits batch and re-sends both halves', async () => {
    // First call → 413, second and third → 200
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 413 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });

    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, mockOptions).promise;
    await runScheduleTimers();

    const idbInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock.results[0].value;
    jest.spyOn(idbInstance, 'storeCurrentSequence');

    const recordArg = mockRecordFunction.mock.calls[0][0] as { emit?: (e: eventWithTime) => void };
    recordArg?.emit?.(mockEvent1);
    recordArg?.emit?.(mockEvent2);

    sessionReplay.sendEvents();
    await (idbInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
    // First timer run: fires initial flush → send() gets 413 → splitAndRequeue schedules two sub-batches
    await runScheduleTimers();
    // Let the async chain from send() fully resolve (fetch promise + handleReponse chain)
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);
    // Second timer run: fires the re-queued sub-batch timers
    await runScheduleTimers();
    // flush processes sub-batches sequentially; each send() has two async ticks (fetch + handleReponse).
    // Wait for both to complete before asserting.
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    const calls = (fetch as jest.Mock).mock.calls;
    // First call got 413, then two sub-batch calls
    expect(calls).toHaveLength(3);

    // Each sub-batch body is valid msgpack with 1 event
    const body1 = calls[1][1].body as Uint8Array;
    const body2 = calls[2][1].body as Uint8Array;
    const decoded1 = MsgPack.decode(body1) as { events: unknown[] };
    const decoded2 = MsgPack.decode(body2) as { events: unknown[] };
    expect(decoded1.events).toHaveLength(1);
    expect(decoded2.events).toHaveLength(1);
  });

  test('JSON path is unaffected when useMessagePack is false', async () => {
    const calls = await runSession([mockEvent1], { ...mockOptions, useMessagePack: false });
    const headers = calls[0][1].headers as Record<string, string>;
    const body = calls[0][1].body as string;

    expect(headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(body) as { version: number; events: string[] };
    expect(parsed.version).toBe(1);
    expect(typeof parsed.events[0]).toBe('string');
  });
});
