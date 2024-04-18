import { Logger } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import { SessionReplayLocalConfig } from '../src/config/local-config';
import { SessionReplaySessionIDBStore } from '../src/events-idb-store';
import { SessionReplayEventsManager } from '../src/events-manager';
import { IDBStore, RecordingStatus } from '../src/typings/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;

type MockedLogger = jest.Mocked<Logger>;

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

describe('SessionReplayEventsManager', () => {
  let originalFetch: typeof global.fetch;
  const { get, update } = IDBKeyVal as MockedIDBKeyVal;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const config = new SessionReplayLocalConfig('static_key', {
    loggerProvider: mockLoggerProvider,
    sampleRate: 1,
  });
  const sessionIDBStore = new SessionReplaySessionIDBStore({
    loggerProvider: config.loggerProvider,
    apiKey: config.apiKey,
  });
  beforeEach(() => {
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
  describe('initialize', () => {
    test('should read events from storage and send them if shouldSendStoredEvents is true', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      const send = jest.spyOn(eventsManager, 'sendEventsList').mockReturnValueOnce();

      await eventsManager.initialize({ sessionId: 456, deviceId: '1a2b3c', shouldSendStoredEvents: true });
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(1);

      // Should send only events from sequences marked as recording and not current session
      expect(send.mock.calls[0][0]).toEqual({
        events: [mockEventString],
        sequenceId: 3,
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });

    test('should not send stored events if shouldSendStoredEvents is false', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      const send = jest.spyOn(eventsManager, 'sendEventsList').mockReturnValueOnce();

      await eventsManager.initialize({ sessionId: 456, deviceId: '1a2b3c' });
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(0);
    });
    test('should return early if using old format of IDBStore', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution = Promise.resolve({
        123: {
          events: [mockEventString],
          sequenceId: 1,
        },
        456: {
          events: [mockEventString],
          sequenceId: 1,
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      const send = jest.spyOn(eventsManager, 'sendEventsList').mockReturnValueOnce();
      await eventsManager.initialize({ sessionId: 123, deviceId: '1a2b3c', shouldSendStoredEvents: true });
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(0);
    });
    test('should configure current sequence id and events correctly if last sequence was sent', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      await eventsManager.initialize({ sessionId: 123, deviceId: '1a2b3c', shouldSendStoredEvents: true });
      expect(eventsManager.currentSequenceId).toEqual(4);
      expect(eventsManager.events).toEqual([]);
    });
    test('should configure current sequence id and events correctly if last sequence was recording', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      await eventsManager.initialize({ sessionId: 123, deviceId: '1a2b3c', shouldSendStoredEvents: true });
      expect(eventsManager.currentSequenceId).toEqual(3);
      expect(eventsManager.events).toEqual([mockEventString]);
    });
    test('should handle no stored events', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await eventsManager.initialize({ sessionId: 123, deviceId: '1a2b3c', shouldSendStoredEvents: true });
      expect(eventsManager.currentSequenceId).toBe(0);
      expect(eventsManager.events).toEqual([]);
    });
    test('should handle no stored sequences for session', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const mockGetResolution = Promise.resolve({
        123: {
          currentSequenceId: 0,
          sessionSequences: {},
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      await eventsManager.initialize({ sessionId: 123, deviceId: '1a2b3c', shouldSendStoredEvents: true });
      expect(eventsManager.currentSequenceId).toBe(0);
      expect(eventsManager.events).toEqual([]);
    });
  });

  describe('sendStoredEvents', () => {
    test('should send all recording sequences except the current sequence for the current session', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      eventsManager.currentSequenceId = 3;
      const store: IDBStore = {
        123: {
          currentSequenceId: 5,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            4: {
              events: [],
              status: RecordingStatus.SENT,
            },
            5: {
              events: [mockEventString, mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 3,
          sessionSequences: {
            1: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      };
      const sendEventsList = jest.spyOn(eventsManager, 'sendEventsList');
      eventsManager.sendStoredEvents({ storedReplaySessions: store, sessionId: 456, deviceId: '1a2b3c' });
      expect(sendEventsList).toHaveBeenCalledTimes(3);
      expect(sendEventsList.mock.calls[0][0]).toEqual({
        events: [mockEventString],
        sequenceId: 3,
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(sendEventsList.mock.calls[1][0]).toEqual({
        events: [mockEventString, mockEventString],
        sequenceId: 5,
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(sendEventsList.mock.calls[2][0]).toEqual({
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 456,
        deviceId: '1a2b3c',
      });
    });
  });

  describe('addEvent', () => {
    test('should store events in class and in IDB', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      eventsManager.addEvent({ event: mockEventString, sessionId: 123, deviceId: '1a2b3c' });
      expect(eventsManager.events).toEqual([mockEventString]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        123: {
          currentSequenceId: 0,
          sessionSequences: {
            0: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });

    test('should split the events list at an increasing interval and send', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      eventsManager.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const sendEventsList = jest.spyOn(eventsManager, 'sendEventsList');
      // Add first event, which is not sent immediately
      eventsManager.addEvent({ event: mockEventString, sessionId: 123, deviceId: '1a2b3c' });

      expect(sendEventsList).toHaveBeenCalledTimes(0);
      // Add second event and advance timers to interval
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:31:00').getTime());
      eventsManager.addEvent({ event: mockEventString, sessionId: 123, deviceId: '1a2b3c' });
      expect(sendEventsList).toHaveBeenCalledTimes(1);
      expect(sendEventsList).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 0,
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(eventsManager.events).toEqual([mockEventString]);
      expect(eventsManager.currentSequenceId).toEqual(1);
    });

    test('should split the events list at max size and send', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      eventsManager.maxPersistedEventsSize = 20;
      // Simulate as if many events have already been built up
      const events = ['#'.repeat(20)];
      eventsManager.events = events;
      const sendEventsListMock = jest
        .spyOn(eventsManager, 'sendEventsList')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementationOnce(() => {});
      eventsManager.addEvent({ event: mockEventString, sessionId: 123, deviceId: '1a2b3c' });
      expect(sendEventsListMock).toHaveBeenCalledTimes(1);
      expect(sendEventsListMock).toHaveBeenCalledWith({
        events,
        sequenceId: 0,
        sessionId: 123,
        deviceId: '1a2b3c',
      });

      expect(eventsManager.events).toEqual([mockEventString]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        123: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });
  });

  describe('sendEvents', () => {
    test('should call trackDestination sendEventsList', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      eventsManager.events = [mockEventString];
      eventsManager.currentSequenceId = 4;
      const trackSendEventsList = jest.spyOn(eventsManager.trackDestination, 'sendEventsList');
      eventsManager.sendEvents({
        sessionId: 123,
        deviceId: '1a2b3c',
      });

      expect(trackSendEventsList).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 4,
        sessionId: 123,
        flushMaxRetries: config.flushMaxRetries,
        apiKey: config.apiKey,
        deviceId: '1a2b3c',
        sampleRate: config.sampleRate,
        serverZone: config.serverZone,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onComplete: expect.anything(),
      });
    });
    test('should update IDB store upon success', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const cleanUpSessionEventsStore = jest.spyOn(eventsManager.sessionIDBStore, 'cleanUpSessionEventsStore');
      eventsManager.events = [mockEventString];
      eventsManager.currentSequenceId = 4;
      eventsManager.sendEvents({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      await runScheduleTimers();
      expect(cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
      expect(cleanUpSessionEventsStore.mock.calls[0]).toEqual([123, 4]);
      expect(update).toHaveBeenCalledWith('AMP_replay_unsent_static_key', expect.anything());
    });
    test('should remove session events from IDB store upon failure', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      eventsManager.events = [mockEventString];
      eventsManager.currentSequenceId = 4;
      const cleanUpSessionEventsStore = jest
        .spyOn(eventsManager.sessionIDBStore, 'cleanUpSessionEventsStore')
        .mockReturnValueOnce(Promise.resolve());
      (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject());

      eventsManager.sendEvents({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      await runScheduleTimers();
      expect(cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
      expect(cleanUpSessionEventsStore.mock.calls[0]).toEqual([123, 4]);
    });
  });

  describe('shouldSplitEventsList', () => {
    describe('event list size', () => {
      test('should return true if size of events list plus size of next event is over the max size', () => {
        const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
        const eventsList = ['#'.repeat(20)];
        eventsManager.events = eventsList;
        eventsManager.maxPersistedEventsSize = 20;
        const nextEvent = 'a';
        const result = eventsManager.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
      test('should return false if size of events list plus size of next event is under the max size', () => {
        const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
        const eventsList = ['#'.repeat(20)];
        eventsManager.events = eventsList;
        eventsManager.maxPersistedEventsSize = 22;
        const nextEvent = 'a';
        const result = eventsManager.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
    });
    describe('interval', () => {
      test('should return false if timeAtLastSend is null', () => {
        const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
        const nextEvent = 'a';
        const result = eventsManager.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return false if it has not been long enough since last send', () => {
        const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
        eventsManager.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
        jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
        const nextEvent = 'a';
        const result = eventsManager.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return true if it has been long enough since last send and events have been emitted', () => {
        const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
        eventsManager.events = [mockEventString];
        eventsManager.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
        jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:33:00').getTime());
        const nextEvent = 'a';
        const result = eventsManager.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
    });
  });

  describe('flush', () => {
    test('should call track destination flush with useRetry as true', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const flushMock = jest.spyOn(eventsManager.trackDestination, 'flush');

      await eventsManager.flush(true);
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(true);
    });
    test('should call track destination flush without useRetry', async () => {
      const eventsManager = new SessionReplayEventsManager({ config, sessionIDBStore });
      const flushMock = jest.spyOn(eventsManager.trackDestination, 'flush');

      await eventsManager.flush();
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(false);
    });
  });
});
