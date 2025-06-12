/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as AnalyticsCore from '@amplitude/analytics-core';
import * as RemoteConfigFetch from '@amplitude/analytics-remote-config';
import { LogLevel, ILogger, ServerZone } from '@amplitude/analytics-core';
import * as RRWeb from '@amplitude/rrweb-record';
import { IDBFactory } from 'fake-indexeddb';
import { EventType, SessionReplayOptions } from 'src/typings/session-replay';
import { SESSION_REPLAY_EU_URL as SESSION_REPLAY_EU_SERVER_URL } from '../src/constants';
import * as SessionReplayIDB from '../src/events/events-idb-store';
import { UNEXPECTED_ERROR_MESSAGE } from '../src/messages';
import { SessionReplay } from '../src/session-replay';

jest.mock('idb-keyval');
type MockedLogger = jest.Mocked<ILogger>;
jest.mock('@amplitude/rrweb-record');
type MockedRRWeb = jest.Mocked<typeof import('@amplitude/rrweb-record')>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

async function runScheduleTimers() {
  // exhause first setTimeout
  jest.runAllTimers();
  // wait for next tick to call nested setTimeout
  await Promise.resolve();
  // exhause nested setTimeout
  jest.runAllTimers();
}
describe('module level integration', () => {
  const { record } = RRWeb as MockedRRWeb;
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
    sessionId: 123,
    serverZone: ServerZone.EU,
  };
  let getRemoteConfigMock: jest.Mock;
  beforeEach(() => {
    getRemoteConfigMock = jest.fn();
    jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
      getRemoteConfig: getRemoteConfigMock,
      metrics: {},
    });
    jest.spyOn(SessionReplayIDB.SessionReplayEventsIDBStore, 'new');
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  describe('with optOut in config', () => {
    test('should not record session if excluded due to optOut', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true }).promise;
      expect(record).not.toHaveBeenCalled();
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalledWith(SESSION_REPLAY_EU_SERVER_URL);
    });
  });
  describe('without a session id', () => {
    test('should not record session if no session id', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: undefined }).promise;
      expect(record).not.toHaveBeenCalled();
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalledWith(SESSION_REPLAY_EU_SERVER_URL);
    });
  });
  describe('tracking replay events', () => {
    test('should handle unknown event type', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'unknown' as EventType, data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalled();
    });
    test('should handle unexpected error', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenLastCalledWith(
        `${SESSION_REPLAY_EU_SERVER_URL}?device_id=1a2b3c&session_id=123&type=replay`,
        expect.anything(),
      );
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith('API Failure');
    });
    test('should not retry for 400 error', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
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
      // Log is called from init, but that's not what we're testing here
      mockLoggerProvider.log.mockClear();
      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenLastCalledWith(
        `${SESSION_REPLAY_EU_SERVER_URL}?device_id=1a2b3c&session_id=123&type=replay`,
        expect.anything(),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith('Network error occurred, event batch rejected');
    });
    test('should not retry for 413 error', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 413,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });

      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenLastCalledWith(
        `${SESSION_REPLAY_EU_SERVER_URL}?device_id=1a2b3c&session_id=123&type=replay`,
        expect.anything(),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith('Network error occurred, event batch rejected');
    });
    test('should handle retry for 500 error', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock).mockReset();
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });

      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should only retry once for 500 error, even if config set to higher than one retry', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 10 }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock).mockReset();
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        });

      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    test('should handle retry for 503 error', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock).mockReset();
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 503,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });

      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    test('should handle unexpected error where fetch response is null', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.SessionReplayEventsIDBStore.new as jest.Mock).mock
        .results[0].value;
      jest.spyOn(createEventsIDBStoreInstance, 'storeCurrentSequence');
      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve(null);
      });

      if (!sessionReplay.eventsManager) {
        throw new Error('did not init');
      }
      sessionReplay.eventsManager.addEvent({
        sessionId: 123,
        event: { type: 'replay', data: mockEventString },
        deviceId: '1a2b3c',
      });
      sessionReplay.sendEvents();
      await (createEventsIDBStoreInstance.storeCurrentSequence as jest.Mock).mock.results[0].value;
      await runScheduleTimers();
      expect(fetch).toHaveBeenLastCalledWith(
        `${SESSION_REPLAY_EU_SERVER_URL}?device_id=1a2b3c&session_id=123&type=replay`,
        expect.anything(),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(UNEXPECTED_ERROR_MESSAGE);
    });
  });
});
