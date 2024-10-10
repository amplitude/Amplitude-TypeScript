import { Logger } from '@amplitude/analytics-types';
import { SessionReplayLocalConfig } from '../src/config/local-config';
import { EventCompressor } from '../src/events/event-compressor';
import { createEventsManager } from '../src/events/events-manager';
import { SessionReplayEventsManager } from '../src/typings/session-replay';

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};

type MockedLogger = jest.Mocked<Logger>;

describe('EventCompressor', () => {
  let eventsManager: SessionReplayEventsManager<'replay' | 'interaction', string>;
  let eventCompressor: EventCompressor;
  const mockRequestIdleCallback = jest.fn((callback: (deadline: IdleDeadline) => void) => {
    const mockIdleDeadline: IdleDeadline = {
      timeRemaining: () => 50,
      didTimeout: false,
    };
    return callback(mockIdleDeadline);
  });
  (global.requestIdleCallback as jest.Mock) = mockRequestIdleCallback;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const deviceId = '4abce3b0-0b1b-4b3b-8b3b-3b0b1b4b3b8b';
  const sessionId = 123;
  let deferEvents: typeof global.requestIdleCallback;
  const config = new SessionReplayLocalConfig('static_key', {
    loggerProvider: mockLoggerProvider,
    sampleRate: 1,
    performanceConfig: {
      enabled: true,
      timeout: 2000,
    },
  });

  beforeEach(async () => {
    eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
    });
    eventCompressor = new EventCompressor(eventsManager, config, deviceId);
    deferEvents = global.requestIdleCallback;
  });

  afterEach(() => {
    jest.resetAllMocks();
    global.requestIdleCallback = deferEvents;
    jest.useRealTimers();
  });

  test('should schedule idle processing if not already processing', () => {
    const scheduleIdleProcessingMock = jest.spyOn(eventCompressor, 'scheduleIdleProcessing');
    expect(eventCompressor.isProcessing).toBe(false);

    eventCompressor.enqueueEvent(mockEvent, 123);

    expect(scheduleIdleProcessingMock).toHaveBeenCalledTimes(1);
    expect(mockRequestIdleCallback).toHaveBeenCalledTimes(1);
  });

  test('should not schedule idle processing if already processing', () => {
    eventCompressor.isProcessing = true;
    eventCompressor.scheduleIdleProcessing();
    expect(mockRequestIdleCallback).not.toHaveBeenCalled();
  });

  test('should immediately compress and add the event if idle callback is not supported', () => {
    eventCompressor.canUseIdleCallback = false;
    const addEventMock = jest.spyOn(eventsManager, 'addEvent');
    eventCompressor.enqueueEvent(mockEvent, sessionId);

    expect(eventCompressor.taskQueue.length).toBe(0);
    expect(addEventMock).toHaveBeenCalled();
  });

  test('should process events in the queue and add compressed events', () => {
    eventCompressor.taskQueue.push({ event: mockEvent, sessionId });
    eventCompressor.taskQueue.push({ event: mockEvent, sessionId });

    const mockIdleDeadline = { timeRemaining: () => 0, didTimeout: true } as IdleDeadline;

    const addEventMock = jest.spyOn(eventsManager, 'addEvent');

    eventCompressor.processQueue(mockIdleDeadline);

    expect(addEventMock).toHaveBeenCalled();
    expect(eventCompressor.taskQueue.length).toBe(0);
  });

  test('should call requestIdleCallback if there are still tasks in the queue', () => {
    eventCompressor.taskQueue.push({ event: mockEvent, sessionId });
    eventCompressor.taskQueue.push({ event: mockEvent, sessionId });

    const mockIdleDeadline = { timeRemaining: () => 0, didTimeout: false } as IdleDeadline;

    const processQueueMock = jest.spyOn(eventCompressor, 'processQueue');

    eventCompressor.processQueue(mockIdleDeadline);
    expect(processQueueMock).toHaveBeenCalledTimes(1);
    expect(mockRequestIdleCallback).toHaveBeenCalled();
  });

  test('should not call requestIdleCallback if preformance config is undefined', () => {
    eventCompressor.config.performanceConfig = undefined;

    const addCompressedEventMock = jest.spyOn(eventCompressor, 'addCompressedEvent');

    eventCompressor.enqueueEvent(mockEvent, sessionId);

    expect(eventCompressor.taskQueue.length).toBe(0);
    expect(addCompressedEventMock).toHaveBeenCalledWith(mockEvent, sessionId);
  });

  test('should set isProcessing to false when taskQueue is empty', () => {
    eventCompressor.taskQueue = [];
    const mockIdleDeadline = { timeRemaining: () => 0, didTimeout: false } as IdleDeadline;

    const processQueueMock = jest.spyOn(eventCompressor, 'processQueue');
    eventCompressor.processQueue(mockIdleDeadline);

    expect(processQueueMock).toHaveBeenCalled();
    expect(eventCompressor.isProcessing).toBe(false);
  });

  test('should schedule another idle callback if there are still tasks', () => {
    eventCompressor.taskQueue.push({ event: mockEvent, sessionId });
    eventCompressor.taskQueue.push({ event: mockEvent, sessionId });

    const mockIdleDeadline = {
      timeRemaining: () => 0,
      didTimeout: false,
    } as IdleDeadline;

    const processQueueMock = jest.spyOn(eventCompressor, 'processQueue');
    const requestIdleCallbackSpy = jest.spyOn(global, 'requestIdleCallback');

    eventCompressor.processQueue(mockIdleDeadline);

    expect(processQueueMock).toHaveBeenCalledTimes(1);

    // Verify that requestIdleCallback is called again for the remaining tasks
    expect(requestIdleCallbackSpy).toHaveBeenCalledTimes(1);

    // Simulate the next recursive call by invoking the callback manually
    const idleCallback = requestIdleCallbackSpy.mock.calls[0][0];
    idleCallback(mockIdleDeadline);

    // Ensure processQueue was called recursively
    expect(processQueueMock).toHaveBeenCalledTimes(2);
  });
});
