import { ILogger } from '@amplitude/analytics-core';
import { SessionReplayLocalConfig } from '../src/config/local-config';
import { EventCompressor } from '../src/events/event-compressor';
import { createEventsManager } from '../src/events/events-manager';
import { SessionReplayEventsManager } from '../src/typings/session-replay';
import { EventType, IncrementalSource, eventWithTime, mutationData } from '@amplitude/rrweb-types';

const mockEvent = {
  type: 4, // Meta — not a FullSnapshot
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};

const fullSnapshotEvent: eventWithTime = {
  type: 2, // FullSnapshot
  data: { node: { type: 0, childNodes: [] as any[], id: 1 }, initialOffset: { left: 0, top: 0 } },
  timestamp: 1687358660935,
};

type MockedLogger = jest.Mocked<ILogger>;

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
      legacyReplayEventEncoding: true,
    },
    useWebWorker: true,
  });

  beforeEach(async () => {
    config.performanceConfig = {
      enabled: true,
      timeout: 2000,
      legacyReplayEventEncoding: true,
    };
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

  test('drops oversized event and warns instead of storing it', () => {
    eventCompressor.canUseIdleCallback = false;
    const addEventMock = jest.spyOn(eventsManager, 'addEvent');

    // Build a mock event whose JSON serialization exceeds MAX_SINGLE_EVENT_SIZE (9 MB)
    const oversizedEvent = {
      ...mockEvent,
      data: { payload: 'x'.repeat(9 * 1000 * 1000 + 1) },
    } as unknown as eventWithTime;
    eventCompressor.enqueueEvent(oversizedEvent, sessionId);

    expect(addEventMock).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('exceeds maximum allowed event size'));
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

  test.each([true, false])('should use webworkers if script exists', async (error: boolean) => {
    let postMessageMock = jest.fn();
    let onMessageMock = jest.fn();
    let onErrorMock = jest.fn();
    let terminateMock = jest.fn();
    class MockWorker {
      postMessage = (e: any) => {
        postMessageMock = jest.fn(() => {
          this.onmessage({ data: { compressedEvent: '', sessionId: 1234 } });
        });
        onErrorMock = jest.fn(() => {
          this.onerror(e);
        });
        if (error) {
          onErrorMock(e);
        } else {
          postMessageMock(e);
        }
      };
      onmessage = (e: any) => {
        onMessageMock = jest.fn();
        onMessageMock(e);
      };
      onerror = (e: any) => {
        onErrorMock = jest.fn();
        onErrorMock(e);
      };
      terminate = () => {
        terminateMock = jest.fn();
        terminateMock();
      };
    }

    global.Worker = MockWorker as unknown as typeof global.Worker;

    URL.createObjectURL = jest.fn();
    eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
    });
    eventCompressor = new EventCompressor(eventsManager, config, deviceId, 'console.log("hi")');

    const testEvent: eventWithTime = {
      data: {
        height: 1,
        width: 1,
        href: 'http://localhost',
      },
      type: 4,
      timestamp: 1,
    };
    const testSessionId = 1234;
    eventCompressor.addCompressedEvent(testEvent, testSessionId);

    expect(postMessageMock).toHaveBeenCalledTimes(error ? 0 : 1);
    expect(onErrorMock).toHaveBeenCalledTimes(error ? 1 : 0);

    eventCompressor.terminate();
    expect(terminateMock).toHaveBeenCalled();
  });

  test('should handle DataCloneError and fallback to JSON.stringify', async () => {
    let onMessageMock = jest.fn();
    let onErrorMock = jest.fn();
    let terminateMock = jest.fn();
    let callCount = 0;

    class MockWorker {
      postMessage = () => {
        callCount++;
        // Simulate DataCloneError on first call, success on second
        if (callCount === 1) {
          const error = new Error('DataCloneError');
          error.name = 'DataCloneError';
          throw error;
        }
        // On second call, simulate success
        this.onmessage({ data: { compressedEvent: '', sessionId: 1234 } });
      };
      onmessage = (e: any) => {
        onMessageMock = jest.fn();
        onMessageMock(e);
      };
      onerror = (e: any) => {
        onErrorMock = jest.fn();
        onErrorMock(e);
      };
      terminate = () => {
        terminateMock = jest.fn();
        terminateMock();
      };
    }

    global.Worker = MockWorker as unknown as typeof global.Worker;

    URL.createObjectURL = jest.fn();
    eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
    });
    eventCompressor = new EventCompressor(eventsManager, config, deviceId, 'console.log("hi")');

    const testEvent: eventWithTime = {
      data: {
        height: 1,
        width: 1,
        href: 'http://localhost',
      },
      type: 4,
      timestamp: 1,
    };
    const testSessionId = 1234;
    eventCompressor.addCompressedEvent(testEvent, testSessionId);

    // Should be called twice - once with original data (throws DataCloneError), once with JSON.stringify (succeeds)
    expect(callCount).toBe(2);

    eventCompressor.terminate();
    expect(terminateMock).toHaveBeenCalled();
  });

  test('should log warning for unexpected errors in webworker', async () => {
    let postMessageMock = jest.fn();
    let onMessageMock = jest.fn();
    let onErrorMock = jest.fn();
    let terminateMock = jest.fn();

    class MockWorker {
      postMessage = (e: any) => {
        postMessageMock = jest.fn(() => {
          // Simulate unexpected error
          const error = new Error('Unexpected error');
          error.name = 'SomeOtherError';
          throw error;
        });
        onErrorMock = jest.fn(() => {
          this.onerror(e);
        });
        postMessageMock(e);
      };
      onmessage = (e: any) => {
        onMessageMock = jest.fn();
        onMessageMock(e);
      };
      onerror = (e: any) => {
        onErrorMock = jest.fn();
        onErrorMock(e);
      };
      terminate = () => {
        terminateMock = jest.fn();
        terminateMock();
      };
    }

    global.Worker = MockWorker as unknown as typeof global.Worker;

    URL.createObjectURL = jest.fn();
    eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
    });
    eventCompressor = new EventCompressor(eventsManager, config, deviceId, 'console.log("hi")');

    const testEvent: eventWithTime = {
      data: {
        height: 1,
        width: 1,
        href: 'http://localhost',
      },
      type: 4,
      timestamp: 1,
    };
    const testSessionId = 1234;

    // Should not throw, but log a warning instead
    expect(() => {
      eventCompressor.addCompressedEvent(testEvent, testSessionId);
    }).not.toThrow();

    // Verify warning was logged
    expect(mockLoggerProvider['warn']).toHaveBeenCalledWith(
      'Unexpected error while posting message to worker:',
      expect.objectContaining({
        name: 'SomeOtherError',
        message: 'Unexpected error',
      }),
    );

    eventCompressor.terminate();
    expect(terminateMock).toHaveBeenCalled();
  });

  test('should call preventDefault on worker onerror to suppress uncaught error propagation', async () => {
    let capturedOnerror: ((e: any) => void) | undefined;
    const mockTerminate = jest.fn();

    class MockWorker {
      set onerror(fn: (e: any) => void) {
        capturedOnerror = fn;
      }
      get onerror() {
        return capturedOnerror ?? jest.fn();
      }
      onmessage: any = null;
      postMessage = jest.fn();
      terminate = () => {
        mockTerminate();
      };
    }

    global.Worker = MockWorker as unknown as typeof global.Worker;
    URL.createObjectURL = jest.fn();

    eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
    });
    eventCompressor = new EventCompressor(eventsManager, config, deviceId, 'console.log("hi")');

    expect(capturedOnerror).toBeDefined();

    const mockPreventDefault = jest.fn();
    const mockErrorEvent = {
      preventDefault: mockPreventDefault,
      message: 'test error',
      filename: 'blob:test',
      lineno: 1,
    };

    (capturedOnerror as (e: any) => void)(mockErrorEvent);

    expect(mockPreventDefault).toHaveBeenCalledTimes(1);
    expect(mockLoggerProvider['error']).toHaveBeenCalledWith(
      expect.stringContaining('Worker failed, falling back to non-worker compression:'),
    );
    expect(mockTerminate).toHaveBeenCalledTimes(1);
    expect(eventCompressor.worker).toBeUndefined();
  });

  test('should handle Worker constructor failure and fall back to non-worker compression', async () => {
    const originalWorker = global.Worker;

    // Mock Worker constructor to throw
    const mockWorkerConstructor = jest.fn().mockImplementation(() => {
      throw new Error('Worker constructor failed');
    });
    global.Worker = mockWorkerConstructor as any;

    URL.createObjectURL = jest.fn();
    eventsManager = await createEventsManager<'replay'>({
      config,
      type: 'replay',
      storeType: 'memory',
    });

    // Create compressor with worker script - should catch the error and fall back
    eventCompressor = new EventCompressor(eventsManager, config, deviceId, 'console.log("hi")');

    expect(mockLoggerProvider['error']).toHaveBeenCalledWith(
      'Failed to create worker, falling back to non-worker compression:',
      expect.objectContaining({
        message: 'Worker constructor failed',
      }),
    );

    // Verify it still works with non-worker compression
    const testEvent: eventWithTime = {
      data: {
        height: 1,
        width: 1,
        href: 'http://localhost',
      },
      type: 4,
      timestamp: 1,
    };
    const testSessionId = 1234;

    expect(() => {
      eventCompressor.addCompressedEvent(testEvent, testSessionId);
    }).not.toThrow();

    global.Worker = originalWorker;
  });

  describe('FullSnapshot immediate processing', () => {
    test('should process full snapshot immediately without idle scheduling', () => {
      const scheduleIdleProcessingMock = jest.spyOn(eventCompressor, 'scheduleIdleProcessing');
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      eventCompressor.enqueueEvent(fullSnapshotEvent, sessionId);

      expect(scheduleIdleProcessingMock).not.toHaveBeenCalled();
      expect(eventCompressor.taskQueue).toHaveLength(0);
      expect(addEventMock).toHaveBeenCalledTimes(1);
    });

    test('should bypass web worker and process full snapshot on main thread', async () => {
      let postMessageCount = 0;
      class MockWorker {
        postMessage = () => {
          postMessageCount++;
        };
        onmessage: any = null;
        onerror: any = null;
        terminate = jest.fn();
      }
      global.Worker = MockWorker as unknown as typeof global.Worker;
      URL.createObjectURL = jest.fn();

      eventsManager = await createEventsManager<'replay'>({ config, type: 'replay', storeType: 'memory' });
      eventCompressor = new EventCompressor(eventsManager, config, deviceId, 'console.log("hi")');

      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      eventCompressor.enqueueEvent(fullSnapshotEvent, sessionId);

      // Worker should NOT be used for FullSnapshot
      expect(postMessageCount).toBe(0);
      expect(addEventMock).toHaveBeenCalledTimes(1);
    });

    test('should call onFullSnapshotProcessed callback after adding full snapshot', () => {
      const onFullSnapshotProcessed = jest.fn();
      eventCompressor.onFullSnapshotProcessed = onFullSnapshotProcessed;

      eventCompressor.enqueueEvent(fullSnapshotEvent, sessionId);

      expect(onFullSnapshotProcessed).toHaveBeenCalledTimes(1);
    });

    test('should not call onFullSnapshotProcessed for non-full-snapshot events', () => {
      const onFullSnapshotProcessed = jest.fn();
      eventCompressor.onFullSnapshotProcessed = onFullSnapshotProcessed;

      eventCompressor.enqueueEvent(mockEvent, sessionId); // type 4 — not FullSnapshot

      expect(onFullSnapshotProcessed).not.toHaveBeenCalled();
    });

    test('should drain idle-queue events before adding full snapshot to preserve ordering', () => {
      // Simulate two incremental events sitting in the idle queue (not yet processed).
      const incrementalA = { ...mockEvent, timestamp: 100 } as eventWithTime;
      const incrementalB = { ...mockEvent, timestamp: 200 } as eventWithTime;
      eventCompressor.taskQueue.push({ event: incrementalA, sessionId });
      eventCompressor.taskQueue.push({ event: incrementalB, sessionId });

      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      eventCompressor.enqueueEvent(fullSnapshotEvent, sessionId);

      // All three events should have been added to the manager
      expect(addEventMock).toHaveBeenCalledTimes(3);

      // Incremental events must come BEFORE the full snapshot
      const calls = addEventMock.mock.calls.map(
        (call) => JSON.parse(call[0].event.data) as { type: number; timestamp: number },
      );
      expect(calls[0].timestamp).toBe(100); // incrementalA
      expect(calls[1].timestamp).toBe(200); // incrementalB
      expect(calls[2].type).toBe(2); // FullSnapshot

      // Idle queue should be empty after draining
      expect(eventCompressor.taskQueue).toHaveLength(0);
      expect(eventCompressor.isProcessing).toBe(false);
    });

    test('should serialize full snapshot with key-ordered JSON', () => {
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      eventCompressor.enqueueEvent(fullSnapshotEvent, sessionId);

      const callArg = addEventMock.mock.calls[0][0];
      const serialized = JSON.parse(callArg.event.data);
      const keys = Object.keys(serialized);
      expect(keys[0]).toBe('type');
      expect(keys[1]).toBe('timestamp');
    });
  });

  describe('flushQueue', () => {
    test('should synchronously drain all queued events and reset isProcessing', () => {
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      eventCompressor.taskQueue.push({ event: mockEvent as eventWithTime, sessionId });
      eventCompressor.taskQueue.push({ event: mockEvent as eventWithTime, sessionId });
      eventCompressor.isProcessing = true;

      eventCompressor.flushQueue();

      expect(addEventMock).toHaveBeenCalledTimes(2);
      expect(eventCompressor.taskQueue).toHaveLength(0);
      expect(eventCompressor.isProcessing).toBe(false);
    });

    test('should be a no-op and reset isProcessing when queue is empty', () => {
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      eventCompressor.isProcessing = true;

      eventCompressor.flushQueue();

      expect(addEventMock).not.toHaveBeenCalled();
      expect(eventCompressor.isProcessing).toBe(false);
    });

    test('should drain pendingQueue events before processing taskQueue on flush', () => {
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      // Simulate events that arrived in pendingQueue before idle callback fired
      eventCompressor.pendingQueue.push({ event: mockEvent as eventWithTime, sessionId });
      eventCompressor.pendingQueue.push({ event: mockEvent as eventWithTime, sessionId });
      eventCompressor.isProcessing = true;

      eventCompressor.flushQueue();

      // Both pending events must be compressed and added to the manager
      expect(addEventMock).toHaveBeenCalledTimes(2);
      expect(eventCompressor.pendingQueue).toHaveLength(0);
      expect(eventCompressor.taskQueue).toHaveLength(0);
      expect(eventCompressor.isProcessing).toBe(false);
    });

    test('should drain both pendingQueue and taskQueue events on flush', () => {
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      // One event already promoted to taskQueue, one still in pendingQueue
      eventCompressor.taskQueue.push({ event: mockEvent as eventWithTime, sessionId });
      eventCompressor.pendingQueue.push({ event: mockEvent as eventWithTime, sessionId });
      eventCompressor.isProcessing = true;

      eventCompressor.flushQueue();

      expect(addEventMock).toHaveBeenCalledTimes(2);
      expect(eventCompressor.pendingQueue).toHaveLength(0);
      expect(eventCompressor.taskQueue).toHaveLength(0);
      expect(eventCompressor.isProcessing).toBe(false);
    });

    test('should bypass web worker and compress synchronously even when a worker is present', async () => {
      const postMessageMock = jest.fn();
      class MockWorker {
        postMessage = postMessageMock;
        onmessage: any = null;
        onerror: any = null;
        terminate = jest.fn();
      }
      global.Worker = MockWorker as unknown as typeof global.Worker;
      URL.createObjectURL = jest.fn();

      const workerEventsManager = await createEventsManager<'replay'>({
        config,
        type: 'replay',
        storeType: 'memory',
      });
      const addEventMock = jest.spyOn(workerEventsManager, 'addEvent');
      const workerCompressor = new EventCompressor(workerEventsManager, config, deviceId, 'console.log("hi")');

      workerCompressor.taskQueue.push({ event: mockEvent as eventWithTime, sessionId });
      workerCompressor.flushQueue();

      // Worker must NOT be used — postMessage is async and events would be lost on unload
      expect(postMessageMock).not.toHaveBeenCalled();
      // Event must be written directly to the manager
      expect(addEventMock).toHaveBeenCalledTimes(1);
      expect(workerCompressor.taskQueue).toHaveLength(0);
      expect(workerCompressor.isProcessing).toBe(false);
    });
  });

  describe('mergeMutationTasks via processQueue', () => {
    function makeMutationEvent(timestamp: number): eventWithTime {
      return {
        type: EventType.IncrementalSnapshot,
        timestamp,
        data: { source: IncrementalSource.Mutation, texts: [], attributes: [], removes: [], adds: [] } as mutationData,
      };
    }

    test('passes through a single pending event unchanged when merging is enabled', () => {
      eventCompressor.config.performanceConfig = { enabled: true, mergeMutations: true };
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      const m1 = makeMutationEvent(100);
      eventCompressor.pendingQueue.push({ event: m1, sessionId });

      const mockIdleDeadline = { timeRemaining: () => 50, didTimeout: false } as IdleDeadline;
      eventCompressor.processQueue(mockIdleDeadline);

      expect(addEventMock).toHaveBeenCalledTimes(1);
      expect(eventCompressor.pendingQueue).toHaveLength(0);
    });

    test('merges pending mutation events into a single task before processing', () => {
      eventCompressor.config.performanceConfig = { enabled: true, mergeMutations: true };
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      const m1 = makeMutationEvent(100);
      const m2 = makeMutationEvent(200);
      eventCompressor.pendingQueue.push({ event: m1, sessionId });
      eventCompressor.pendingQueue.push({ event: m2, sessionId });

      const mockIdleDeadline = { timeRemaining: () => 50, didTimeout: false } as IdleDeadline;
      eventCompressor.processQueue(mockIdleDeadline);

      // Two pending mutations → merged into one → one compressed event
      expect(addEventMock).toHaveBeenCalledTimes(1);
      expect(eventCompressor.pendingQueue).toHaveLength(0);
    });

    test('keeps tasks from different sessions separate when merging', () => {
      eventCompressor.config.performanceConfig = { enabled: true, mergeMutations: true };
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      const sessionA = 111;
      const sessionB = 222;
      const m1 = makeMutationEvent(100);
      const m2 = makeMutationEvent(200);
      const m3 = makeMutationEvent(300);
      // Two mutations for sessionA, one for sessionB — sessionA run merges; sessionB stays as-is
      eventCompressor.pendingQueue.push({ event: m1, sessionId: sessionA });
      eventCompressor.pendingQueue.push({ event: m2, sessionId: sessionA });
      eventCompressor.pendingQueue.push({ event: m3, sessionId: sessionB });

      const mockIdleDeadline = { timeRemaining: () => 50, didTimeout: false } as IdleDeadline;
      eventCompressor.processQueue(mockIdleDeadline);

      // sessionA: 2 → 1 merged; sessionB: 1 stays → 2 total compressed events
      expect(addEventMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('deflate replay event encoding (default)', () => {
    const flushMicrotasks = async () => {
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((resolve) => {
          queueMicrotask(resolve);
        });
      }
    };

    const mockCompressionStream = (zlibBytes: Uint8Array) => {
      class MockCompressionStream {
        writable = {
          getWriter: () => ({
            write: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
          }),
        };
        readable = {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({ done: false, value: zlibBytes })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        };
      }
      return MockCompressionStream;
    };

    test('main-thread zlib encoding stores wrapped events', async () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const zlibBytes = new Uint8Array([1, 2, 3]);
      (global as unknown as { CompressionStream: unknown }).CompressionStream = mockCompressionStream(zlibBytes);
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId);
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      zlibCompressor.addCompressedEvent(mockEvent as eventWithTime, sessionId);
      await flushMicrotasks();

      expect(addEventMock).toHaveBeenCalled();
      delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
    });

    test('full snapshot async path drains queued events before snapshot', async () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      (global as unknown as { CompressionStream: unknown }).CompressionStream = mockCompressionStream(
        new Uint8Array([9]),
      );
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId);
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');
      zlibCompressor.taskQueue.push({ event: mockEvent as eventWithTime, sessionId });
      zlibCompressor.taskQueue.push({ event: { ...mockEvent, timestamp: 2 } as eventWithTime, sessionId });

      zlibCompressor.enqueueEvent(fullSnapshotEvent, sessionId);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(addEventMock.mock.calls.length).toBeGreaterThanOrEqual(3);
      delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
    });

    test('worker flush and compressed messages update delivery chain', async () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      type MockWorker = {
        onmessage: ((e: { data: unknown }) => void) | null;
        onerror:
          | ((e: { preventDefault: () => void; message: string; filename: string; lineno: number }) => void)
          | null;
        postMessage: jest.Mock;
        terminate: jest.Mock;
      };
      const mockWorker: MockWorker = {
        onmessage: null,
        onerror: null,
        postMessage: jest.fn(),
        terminate: jest.fn(),
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');

      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');
      const addEventMock = jest.spyOn(eventsManager, 'addEvent');

      zlibCompressor.enqueueEvent(fullSnapshotEvent, sessionId);
      await flushMicrotasks();
      expect(mockWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ flush: true }));

      const worker = (zlibCompressor as unknown as { worker: MockWorker }).worker;
      worker.onmessage?.({ data: { flushed: true } });
      await flushMicrotasks();
      worker.onmessage?.({ data: { compressedEvent: '"wrapped"', sessionId } });
      worker.onmessage?.({ data: {} });
      await flushMicrotasks();

      expect(addEventMock).toHaveBeenCalled();
    });

    test('postToCompressionWorker logs unexpected errors', () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const postMessage = jest.fn().mockImplementation(() => {
        throw new Error('other');
      });
      const mockWorker = { onmessage: null, onerror: null, postMessage, terminate: jest.fn() };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');

      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');
      zlibCompressor.addCompressedEvent(mockEvent as eventWithTime, sessionId);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('postToCompressionWorker retries with JSON on DataCloneError', () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const postMessage = jest
        .fn()
        .mockImplementationOnce(() => {
          const err = new Error('clone');
          err.name = 'DataCloneError';
          throw err;
        })
        .mockImplementationOnce(() => undefined);
      const mockWorker = { onmessage: null, onerror: null, postMessage, terminate: jest.fn() };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');

      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');
      zlibCompressor.addCompressedEvent(mockEvent as eventWithTime, sessionId);
      expect(postMessage).toHaveBeenCalledTimes(2);
      expect(typeof postMessage.mock.calls[1][0]).toBe('string');
    });

    test('worker onerror falls back to non-worker compression', () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const mockWorker = {
        onmessage: null,
        onerror: null as ((e: unknown) => void) | null,
        postMessage: jest.fn(),
        terminate: jest.fn(),
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');

      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');
      mockWorker.onerror?.({
        preventDefault: jest.fn(),
        message: 'boom',
        filename: 'w.js',
        lineno: 1,
      });
      expect((zlibCompressor as unknown as { worker?: Worker }).worker).toBeUndefined();
    });

    test('honors explicit performance timeout', () => {
      const cfg = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: true, timeout: 1234, legacyReplayEventEncoding: false },
      });
      const compressor = new EventCompressor(eventsManager, cfg, deviceId);
      expect((compressor as unknown as { timeout: number }).timeout).toBe(1234);
    });

    test('postToCompressionWorker is a no-op without a worker', () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId);
      (zlibCompressor as unknown as { worker?: Worker }).worker = undefined;
      (
        zlibCompressor as unknown as { postToCompressionWorker: (e: eventWithTime, s: number) => void }
      ).postToCompressionWorker(mockEvent as eventWithTime, sessionId);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });

    test('uses default idle timeout when performance timeout is omitted', () => {
      const cfg = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: true, legacyReplayEventEncoding: false },
      });
      const compressor = new EventCompressor(eventsManager, cfg, deviceId);
      expect((compressor as unknown as { timeout: number }).timeout).toBe(2000);
    });

    test('async full snapshot does not require onFullSnapshotProcessed callback', async () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      (global as unknown as { CompressionStream: unknown }).CompressionStream = mockCompressionStream(
        new Uint8Array([2]),
      );
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId);
      zlibCompressor.enqueueEvent(fullSnapshotEvent, sessionId);
      await flushMicrotasks();
      await flushMicrotasks();
      expect(zlibCompressor.isProcessing).toBe(false);
      delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
    });

    test('calls onFullSnapshotProcessed on async zlib path', async () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      (global as unknown as { CompressionStream: unknown }).CompressionStream = mockCompressionStream(
        new Uint8Array([1]),
      );
      const onFullSnapshotProcessed = jest.fn();
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId);
      zlibCompressor.onFullSnapshotProcessed = onFullSnapshotProcessed;

      await (
        zlibCompressor as unknown as {
          processFullSnapshotImmediatelyAsync: (e: eventWithTime, s: number) => Promise<void>;
        }
      ).processFullSnapshotImmediatelyAsync(fullSnapshotEvent, sessionId);

      expect(onFullSnapshotProcessed).toHaveBeenCalled();
      delete (global as unknown as { CompressionStream?: unknown }).CompressionStream;
    });

    test('mergeMutationTasks merges multiple events for the same session', () => {
      eventCompressor.config.performanceConfig = { enabled: true, mergeMutations: true };
      const m1 = {
        type: EventType.IncrementalSnapshot,
        timestamp: 100,
        data: { source: IncrementalSource.Mutation, texts: [], attributes: [], removes: [], adds: [] },
      } as eventWithTime;
      const m2 = {
        type: EventType.IncrementalSnapshot,
        timestamp: 200,
        data: { source: IncrementalSource.Mutation, texts: [], attributes: [], removes: [], adds: [] },
      } as eventWithTime;
      const merged = (
        eventCompressor as unknown as {
          mergeMutationTasks: (t: { event: eventWithTime; sessionId: number }[]) => unknown;
        }
      ).mergeMutationTasks([
        { event: m1, sessionId },
        { event: m2, sessionId },
      ]);
      expect(Array.isArray(merged)).toBe(true);
      expect((merged as unknown[]).length).toBeLessThanOrEqual(2);
    });

    test('mergeMutationTasks returns tasks unchanged when mergeMutations is false', () => {
      eventCompressor.config.performanceConfig = { enabled: true, mergeMutations: false };
      const tasks = [
        { event: mockEvent as eventWithTime, sessionId },
        { event: { ...mockEvent, timestamp: 2 } as eventWithTime, sessionId },
      ];
      const merged = (
        eventCompressor as unknown as { mergeMutationTasks: (t: typeof tasks) => typeof tasks }
      ).mergeMutationTasks(tasks);
      expect(merged).toEqual(tasks);
    });

    test('mergeMutationTasks returns a single task without merging', () => {
      eventCompressor.config.performanceConfig = { enabled: true, mergeMutations: true };
      const tasks = [{ event: mockEvent as eventWithTime, sessionId }];
      const merged = (
        eventCompressor as unknown as { mergeMutationTasks: (t: typeof tasks) => typeof tasks }
      ).mergeMutationTasks(tasks);
      expect(merged).toEqual(tasks);
    });

    test('waitForEncoderIdle is a no-op without a worker', async () => {
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId);
      await expect(
        (zlibCompressor as unknown as { waitForEncoderIdle: () => Promise<void> }).waitForEncoderIdle(),
      ).resolves.toBeUndefined();
    });

    test('waitForEncoderIdle resolves on worker flushed message', async () => {
      const mockWorker = {
        onmessage: null as ((e: { data: unknown }) => void) | null,
        postMessage: jest.fn(),
        terminate: jest.fn(),
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');

      const idlePromise = (
        zlibCompressor as unknown as { waitForEncoderIdle: () => Promise<void> }
      ).waitForEncoderIdle();
      await flushMicrotasks();
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ flush: true });
      mockWorker.onmessage?.({ data: { flushed: true } });
      await idlePromise;
    });

    test('worker onmessage ignores malformed payloads', () => {
      const mockWorker = {
        onmessage: null as ((e: { data: unknown }) => void) | null,
        postMessage: jest.fn(),
        terminate: jest.fn(),
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');
      mockWorker.onmessage?.({ data: { compressedEvent: '"x"' } });
      mockWorker.onmessage?.({ data: { sessionId: 1 } });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });

    test('terminate is safe when no worker was created', () => {
      const cfg = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
      });
      const compressor = new EventCompressor(eventsManager, cfg, deviceId);
      expect(() => compressor.terminate()).not.toThrow();
    });

    test('uses default timeout when performanceConfig is absent', () => {
      const cfg = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
      });
      const compressor = new EventCompressor(eventsManager, cfg, deviceId);
      expect((compressor as unknown as { timeout: number }).timeout).toBe(2000);
    });

    test('terminates active compression worker', () => {
      const mockWorker = { onmessage: null, onerror: null, postMessage: jest.fn(), terminate: jest.fn() };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      URL.createObjectURL = jest.fn(() => 'blob:mock');
      const zlibConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: false },
      });
      const zlibCompressor = new EventCompressor(eventsManager, zlibConfig, deviceId, '/*worker*/');
      zlibCompressor.terminate();
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    test('compression is enabled unless legacyReplayEventEncoding is true', () => {
      const gzipConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false },
      });
      const legacyConfig = new SessionReplayLocalConfig('static_key', {
        loggerProvider: mockLoggerProvider,
        sampleRate: 1,
        performanceConfig: { enabled: false, legacyReplayEventEncoding: true },
      });
      const gzipCompressor = new EventCompressor(eventsManager, gzipConfig, deviceId);
      const legacyCompressor = new EventCompressor(eventsManager, legacyConfig, deviceId);
      expect((gzipCompressor as unknown as { gzipReplayEvents: boolean }).gzipReplayEvents).toBe(true);
      expect((legacyCompressor as unknown as { gzipReplayEvents: boolean }).gzipReplayEvents).toBe(false);
    });
  });

  describe('compressEvent key ordering', () => {
    test('should serialize without delay when delay is absent', () => {
      const result = eventCompressor.compressEvent(mockEvent as eventWithTime);
      const parsed = JSON.parse(result);
      const keys = Object.keys(parsed);
      expect(keys[0]).toBe('type');
      expect(keys[1]).toBe('timestamp');
      expect(keys).not.toContain('delay');
    });

    test('should include delay when present and place it after timestamp', () => {
      const eventWithDelay = { ...mockEvent, delay: 50 } as eventWithTime & { delay: number };
      const result = eventCompressor.compressEvent(eventWithDelay);
      const parsed = JSON.parse(result);
      const keys = Object.keys(parsed);
      expect(keys[0]).toBe('type');
      expect(keys[1]).toBe('timestamp');
      expect(keys[2]).toBe('delay');
      expect(parsed.delay).toBe(50);
    });
  });
});
