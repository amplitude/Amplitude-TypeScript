import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import * as RRWeb from '@amplitude/rrweb';
import * as IDBKeyVal from 'idb-keyval';
import { SessionReplayOptions } from 'src/typings/session-replay';
import { DEFAULT_SAMPLE_RATE, DEFAULT_SESSION_REPLAY_PROPERTY } from '../src/constants';
import * as Helpers from '../src/helpers';
import { UNEXPECTED_ERROR_MESSAGE, getSuccessMessage } from '../src/messages';
import { SessionReplay } from '../src/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;
type MockedLogger = jest.Mocked<Logger>;
jest.mock('@amplitude/rrweb');
type MockedRRWeb = jest.Mocked<typeof import('@amplitude/rrweb')>;

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
  const { update } = IDBKeyVal as MockedIDBKeyVal;
  const { record } = RRWeb as MockedRRWeb;
  const addEventListenerMock = jest.fn() as jest.Mock<typeof window.addEventListener>;
  const removeEventListenerMock = jest.fn() as jest.Mock<typeof window.removeEventListener>;
  const mockGlobalScope = {
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
    document: {
      hasFocus: () => true,
    },
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
  const mockEmptyOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    sessionId: 123,
  };
  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(mockGlobalScope);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  describe('with a sample rate', () => {
    test('should not record session if excluded due to sampling', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => false);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(0.2);
      const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
      expect(sessionRecordingProperties).toMatchObject({});
      expect(record).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalled();
    });
    test('should record session if included due to sampling', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => true);
      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 200,
        });
      });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8 }).promise;
      const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
      expect(sessionRecordingProperties).toMatchObject({
        [DEFAULT_SESSION_REPLAY_PROPERTY]: '1a2b3c/123',
      });
      // Log is called from setup, but that's not what we're testing here
      mockLoggerProvider.log.mockClear();
      expect(record).toHaveBeenCalled();
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual(getSuccessMessage(123));
    });
  });
  describe('without a sample rate', () => {
    test('should not record session if no sample rate is provided', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => false);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockEmptyOptions }).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
      const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
      expect(sessionRecordingProperties).toMatchObject({});
      expect(record).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalled();
    });
    test('should not record session if sample rate of value 0 is provided', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => false);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockEmptyOptions, sampleRate: 0 }).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
      const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
      expect(sessionRecordingProperties).toMatchObject({});
      expect(record).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('with optOut in config', () => {
    test('should not record session if excluded due to optOut', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true }).promise;
      expect(record).not.toHaveBeenCalled();
      await runScheduleTimers();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
  test('should handle unexpected error', async () => {
    const sessionReplay = new SessionReplay();
    (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
    await sessionReplay.init(apiKey, { ...mockOptions }).promise;
    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('API Failure');
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
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
    // Log is called from init, but that's not what we're testing here
    mockLoggerProvider.log.mockClear();
    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
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
        });
      });
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;

    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
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
        });
      });
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;

    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('should only retry once for 500 error, even if config set to higher than one retry', async () => {
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
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 10 }).promise;

    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(2);
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
        });
      });
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;

    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  test('should handle unexpected error where fetch response is null', async () => {
    (fetch as jest.Mock).mockImplementationOnce(() => {
      return Promise.resolve(null);
    });
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;

    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(UNEXPECTED_ERROR_MESSAGE);
  });
  test('should not allow multiple of the same list to be sent', async () => {
    (fetch as jest.Mock).mockImplementation(() => {
      return Promise.resolve({
        status: 200,
      });
    });
    const sessionReplay = new SessionReplay();
    await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;

    if (!sessionReplay.eventsManager) {
      return;
    }
    sessionReplay.eventsManager.events = [mockEventString];
    sessionReplay.stopRecordingAndSendEvents();
    sessionReplay.stopRecordingAndSendEvents();
    await runScheduleTimers();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
