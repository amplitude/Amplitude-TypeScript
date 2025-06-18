/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as AnalyticsCore from '@amplitude/analytics-core';
import * as RemoteConfigFetch from '@amplitude/analytics-remote-config';
import { LogLevel, ILogger, ServerZone } from '@amplitude/analytics-core';
import { IDBFactory } from 'fake-indexeddb';
import { SessionReplayOptions } from 'src/typings/session-replay';
import * as SessionReplayIDB from '../../src/events/events-idb-store';

import { DEFAULT_SAMPLE_RATE, DEFAULT_SESSION_REPLAY_PROPERTY, SESSION_REPLAY_SERVER_URL } from '../../src/constants';
import * as Helpers from '../../src/helpers';
import { SessionReplay } from '../../src/session-replay';
import { SESSION_ID_IN_20_SAMPLE } from '../test-data';
import { eventWithTime } from '@amplitude/rrweb-types';

type MockedLogger = jest.Mocked<ILogger>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const samplingConfig = {
  sample_rate: 0.5,
  capture_enabled: true,
};

async function runScheduleTimers() {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  await new Promise(process.nextTick);
  jest.runAllTimers();
}

describe('module level integration', () => {
  const addEventListenerMock = jest.fn() as jest.Mock<typeof window.addEventListener>;
  const removeEventListenerMock = jest.fn() as jest.Mock<typeof window.removeEventListener>;
  const mockGlobalScope = {
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
    document: {
      hasFocus: () => true,
    },
    indexedDB: new IDBFactory(),
  } as unknown as typeof globalThis;
  let originalFetch: typeof global.fetch;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const apiKey = 'static_key';
  const mockOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    optOut: false,
    sampleRate: 1,
    sessionId: SESSION_ID_IN_20_SAMPLE,
    serverZone: ServerZone.US,
  };
  const mockEmptyOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    sessionId: SESSION_ID_IN_20_SAMPLE,
  };
  let getRemoteConfigMock: jest.Mock;
  let mockRecordFunction: jest.Mock & { addCustomEvent: jest.Mock };
  beforeEach(() => {
    getRemoteConfigMock = jest.fn();
    jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
      getRemoteConfig: getRemoteConfigMock,
      metrics: {},
    });
    jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new');
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);

    // Create mock record function with addCustomEvent method
    mockRecordFunction = jest.fn().mockReturnValue(jest.fn()) as jest.Mock & { addCustomEvent: jest.Mock };
    mockRecordFunction.addCustomEvent = jest.fn();

    // Mock the getRecordFunction method instead of mocking RRWeb directly
    jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any).mockResolvedValue(mockRecordFunction);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  describe('sampleRate and captureEnabled', () => {
    describe('remote config API failure', () => {
      beforeEach(() => {
        getRemoteConfigMock.mockImplementation(() => Promise.reject('error'));
      });
      test('should not capture replays and use options sampleRate', async () => {
        const sessionReplay = new SessionReplay();
        const initPromise = sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 0 }).promise;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runAllTimers();
        return initPromise.then(() => {
          const sampleRate = sessionReplay.config?.sampleRate;
          // Ensure that sample rate matches what's passed in the options
          expect(sampleRate).toBe(1);
          const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
          expect(sessionRecordingProperties).toMatchObject({});
          expect(mockRecordFunction).not.toHaveBeenCalled();
        });
      });
    });
    describe('without remote config set', () => {
      beforeEach(() => {
        getRemoteConfigMock.mockResolvedValue({});
      });
      test('should capture', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions }).promise;
        // Wait for async initialize to complete
        await runScheduleTimers();
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
          .results[0].value;

        jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
        expect(sessionRecordingProperties).toMatchObject({
          [DEFAULT_SESSION_REPLAY_PROPERTY]: `1a2b3c/${SESSION_ID_IN_20_SAMPLE}`,
        });
        expect(mockRecordFunction).toHaveBeenCalled();
        const recordArg = mockRecordFunction.mock.calls[0][0] as { emit?: (event: eventWithTime) => void };
        recordArg?.emit?.(mockEvent);
        sessionReplay.sendEvents();
        await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;

        await runScheduleTimers();
        expect(fetch).toHaveBeenLastCalledWith(
          `${SESSION_REPLAY_SERVER_URL}?device_id=1a2b3c&session_id=${SESSION_ID_IN_20_SAMPLE}&type=replay`,
          expect.anything(),
        );
        expect(mockLoggerProvider.log).toHaveBeenLastCalledWith(
          'Session replay event batch tracked successfully for session id 1719847315000, size of events: 0 KB',
        );
      });

      test('should use sampleRate from sdk options', async () => {
        const inSampleSpy = jest.spyOn(Helpers, 'isSessionInSample');
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8 }).promise;
        expect(inSampleSpy).toHaveBeenCalledWith(sessionReplay.identifiers?.sessionId, 0.8);
      });
    });
    describe('with remote config set', () => {
      beforeEach(() => {
        getRemoteConfigMock.mockResolvedValue(samplingConfig);
      });
      test('should capture', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions }).promise;
        // Wait for async initialize to complete
        await runScheduleTimers();
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
          .results[0].value;

        jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
        expect(sessionRecordingProperties).toMatchObject({
          [DEFAULT_SESSION_REPLAY_PROPERTY]: `1a2b3c/${SESSION_ID_IN_20_SAMPLE}`,
        });
        expect(mockRecordFunction).toHaveBeenCalled();
        const recordArg = mockRecordFunction.mock.calls[0][0] as { emit?: (event: eventWithTime) => void };
        recordArg?.emit?.(mockEvent);
        sessionReplay.sendEvents();
        await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
        await runScheduleTimers();
        expect(fetch).toHaveBeenLastCalledWith(
          `${SESSION_REPLAY_SERVER_URL}?device_id=1a2b3c&session_id=${SESSION_ID_IN_20_SAMPLE}&type=replay`,
          expect.anything(),
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenLastCalledWith(
          'Session replay event batch tracked successfully for session id 1719847315000, size of events: 0 KB',
        );
      });

      test('should use sampleRate from remote config', async () => {
        const inSampleSpy = jest.spyOn(Helpers, 'isSessionInSample');
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8 }).promise;
        expect(inSampleSpy).toHaveBeenCalledWith(sessionReplay.identifiers?.sessionId, 0.5);
      });
    });
  });
  describe('sampling logic', () => {
    beforeEach(() => {
      getRemoteConfigMock.mockResolvedValue({});
    });
    describe('with a sample rate', () => {
      test('should not record session if excluded due to sampling', async () => {
        const sessionReplay = new SessionReplay();
        // Set sample rate low enough so that SESSION_ID_IN_20_SAMPLE is not included in the sample
        await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.1 }).promise;
        const sampleRate = sessionReplay.config?.sampleRate;
        expect(sampleRate).toBe(0.1);
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({});
        expect(mockRecordFunction).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalledWith(SESSION_REPLAY_SERVER_URL);
      });
      test('should record session if included due to sampling', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8 }).promise;
        // Wait for async initialize to complete
        await runScheduleTimers();
        const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
          .results[0].value;
        jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({
          [DEFAULT_SESSION_REPLAY_PROPERTY]: `1a2b3c/${SESSION_ID_IN_20_SAMPLE}`,
        });
        // Log is called from setup, but that's not what we're testing here
        mockLoggerProvider.log.mockClear();
        expect(mockRecordFunction).toHaveBeenCalled();
        const recordArg = mockRecordFunction.mock.calls[0][0] as { emit?: (event: eventWithTime) => void };
        recordArg?.emit?.(mockEvent);
        sessionReplay.sendEvents();
        await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
        await runScheduleTimers();
        expect(fetch).toHaveBeenLastCalledWith(
          `${SESSION_REPLAY_SERVER_URL}?device_id=1a2b3c&session_id=${SESSION_ID_IN_20_SAMPLE}&type=replay`,
          expect.anything(),
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenLastCalledWith(
          'Session replay event batch tracked successfully for session id 1719847315000, size of events: 0 KB',
        );
      });
    });
    describe('without a sample rate', () => {
      test('should not record session if no sample rate is provided', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockEmptyOptions }).promise;
        const sampleRate = sessionReplay.config?.sampleRate;
        expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({});
        expect(mockRecordFunction).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalledWith(SESSION_REPLAY_SERVER_URL);
      });
      test('should not record session if sample rate of value 0 is provided', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockEmptyOptions, sampleRate: 0 }).promise;
        const sampleRate = sessionReplay.config?.sampleRate;
        expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({});
        expect(mockRecordFunction).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalledWith(SESSION_REPLAY_SERVER_URL);
      });
    });
  });
});
