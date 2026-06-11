import { getGlobalScope } from '@amplitude/analytics-core';
import { EventType as RRWebEventType } from '@amplitude/rrweb-types';
import type { eventWithTime } from '@amplitude/rrweb-types';
import { SessionReplayJoinedConfig } from '../config/types';
import { MAX_SINGLE_EVENT_SIZE } from '../constants';
import { SessionReplayEventsManager } from '../typings/session-replay';
import { encodeReplayEventForStorage, serializeReplayEvent } from '../utils/replay-event-encoding';
import { mergeMutationEvents } from './merge-mutation-events';

interface TaskQueue {
  event: eventWithTime;
  sessionId: string | number;
}

const DEFAULT_TIMEOUT = 2000;
export class EventCompressor {
  taskQueue: TaskQueue[] = [];
  pendingQueue: TaskQueue[] = [];
  isProcessing = false;
  eventsManager?: SessionReplayEventsManager<'replay' | 'interaction', string>;
  config: SessionReplayJoinedConfig;
  deviceId: string | undefined;
  canUseIdleCallback: boolean | undefined;
  timeout: number;
  worker?: Worker;
  onFullSnapshotProcessed?: () => void;
  private readonly gzipReplayEvents: boolean;
  /** Main-thread zlib is async; chain preserves event order when not using the worker. */
  private encodeChain = Promise.resolve();

  constructor(
    eventsManager: SessionReplayEventsManager<'replay' | 'interaction', string>,
    config: SessionReplayJoinedConfig,
    deviceId: string | undefined,
    workerScript?: string,
    onFullSnapshotProcessed?: () => void,
  ) {
    const globalScope = getGlobalScope();
    this.canUseIdleCallback = globalScope && 'requestIdleCallback' in globalScope;
    this.eventsManager = eventsManager;
    this.config = config;
    this.deviceId = deviceId;
    const performanceConfig = config.performanceConfig;
    if (performanceConfig !== undefined && performanceConfig.timeout !== undefined) {
      this.timeout = performanceConfig.timeout;
    } else {
      this.timeout = DEFAULT_TIMEOUT;
    }
    this.onFullSnapshotProcessed = onFullSnapshotProcessed;
    if (performanceConfig !== undefined && performanceConfig.legacyReplayEventEncoding === true) {
      this.gzipReplayEvents = false;
    } else {
      this.gzipReplayEvents = true;
    }

    if (workerScript) {
      config.loggerProvider.log('Enabling web worker for compression');

      try {
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const worker = new Worker(blobUrl);

        worker.onerror = (e) => {
          e.preventDefault();
          config.loggerProvider.error(
            `Worker failed, falling back to non-worker compression: ${e.message} (${e.filename}:${e.lineno})`,
          );
          worker.terminate();
          this.worker = undefined;
        };
        worker.onmessage = (e) => {
          const { compressedEvent, sessionId } = e.data as {
            compressedEvent: string;
            sessionId: string | number;
          };
          this.addCompressedEventToManager(compressedEvent, sessionId);
        };

        this.worker = worker;
      } catch (error) {
        config.loggerProvider.error('Failed to create worker, falling back to non-worker compression:', error);
      }
    }
  }

  // Schedule processing during idle time
  public scheduleIdleProcessing(): void {
    if (!this.isProcessing) {
      this.isProcessing = true;
      requestIdleCallback(
        (idleDeadline) => {
          this.processQueue(idleDeadline);
        },
        { timeout: this.timeout },
      );
    }
  }

  // Add an event to the task queue if idle callback is supported or compress the event directly
  public enqueueEvent(event: eventWithTime, sessionId: string | number): void {
    // Full snapshot (type 2) is the most critical event — a replay cannot be played without it.
    // Process and flush immediately rather than waiting for the idle scheduler or web worker,
    // maximising the chance it is delivered before the user exits the page.
    if (event.type === RRWebEventType.FullSnapshot) {
      if (this.gzipReplayEvents) {
        void this.processFullSnapshotImmediately(event, sessionId).catch((err) => {
          this.config.loggerProvider.warn('Failed to process full snapshot immediately:', err);
        });
      } else {
        this.processFullSnapshotImmediatelySync(event, sessionId);
      }
      return;
    }

    if (this.canUseIdleCallback && this.config.performanceConfig?.enabled) {
      this.config.loggerProvider.debug('Enqueuing event for processing during idle time.');
      this.pendingQueue.push({ event, sessionId });
      this.scheduleIdleProcessing();
    } else {
      this.config.loggerProvider.debug('Processing event without idle callback.');
      this.addCompressedEvent(event, sessionId);
    }
  }

  private processFullSnapshotImmediatelySync = (event: eventWithTime, sessionId: string | number) => {
    this.config.loggerProvider.debug('Processing full snapshot immediately.');
    if (this.taskQueue.length > 0 || this.pendingQueue.length > 0) {
      const allTasks = [...this.taskQueue.splice(0), ...this.mergeMutationTasks(this.pendingQueue.splice(0))];
      for (const task of allTasks) {
        this.addCompressedEventToManager(serializeReplayEvent(task.event), task.sessionId);
      }
      this.isProcessing = false;
    }
    this.addCompressedEventToManager(serializeReplayEvent(event), sessionId);
    this.onFullSnapshotProcessed?.();
  };

  private processFullSnapshotImmediately = async (event: eventWithTime, sessionId: string | number) => {
    this.config.loggerProvider.debug('Processing full snapshot immediately.');
    await this.encodeChain;

    if (this.taskQueue.length > 0 || this.pendingQueue.length > 0) {
      const allTasks = [...this.taskQueue.splice(0), ...this.mergeMutationTasks(this.pendingQueue.splice(0))];
      for (const task of allTasks) {
        const compressed = await this.compressForStorage(task.event);
        this.addCompressedEventToManager(compressed, task.sessionId);
      }
      this.isProcessing = false;
    }
    const compressedEvent = await this.compressForStorage(event);
    this.addCompressedEventToManager(compressedEvent, sessionId);
    this.onFullSnapshotProcessed?.();
  };

  private compressForStorage = async (event: eventWithTime): Promise<string> => {
    return encodeReplayEventForStorage(event, {
      compress: this.gzipReplayEvents,
      scope: getGlobalScope(),
    });
  };

  private appendToEncodeChain = (task: () => Promise<void>) => {
    this.encodeChain = this.encodeChain.then(task, task).catch((err) => {
      this.config.loggerProvider.warn('Replay event compression failed:', err);
    });
  };

  private scheduleCompressAndStore = (event: eventWithTime, sessionId: string | number) => {
    this.appendToEncodeChain(async () => {
      const compressed = await this.compressForStorage(event);
      this.addCompressedEventToManager(compressed, sessionId);
    });
  };

  // Process the task queue during idle time
  public processQueue(idleDeadline: IdleDeadline): void {
    // Merge newly-arrived pending events and append to the already-merged taskQueue.
    // Keeping them separate prevents re-merging already-merged tasks on subsequent calls,
    // which would corrupt move semantics for nodes that appear in multiple merge passes.
    if (this.pendingQueue.length > 0) {
      this.taskQueue.push(...this.mergeMutationTasks(this.pendingQueue.splice(0)));
    }
    // Process tasks while there's idle time or until the max number of tasks is reached
    while (this.taskQueue.length > 0 && (idleDeadline.timeRemaining() > 0 || idleDeadline.didTimeout)) {
      const task = this.taskQueue.shift();
      if (task) {
        const { event, sessionId } = task;
        this.addCompressedEvent(event, sessionId);
      }
    }

    // If there are still tasks in the queue, schedule the next idle callback
    if (this.taskQueue.length > 0 || this.pendingQueue.length > 0) {
      requestIdleCallback(
        (idleDeadline) => {
          this.processQueue(idleDeadline);
        },
        { timeout: this.timeout },
      );
    } else {
      this.isProcessing = false;
    }
  }

  compressEvent = (event: eventWithTime): string => serializeReplayEvent(event);

  private addCompressedEventToManager = (compressedEvent: string, sessionId: string | number) => {
    // UTF-8 byte size, not JS char count: a 9 M-char string of CJK/emoji can be 18–27 MB
    // on the wire and would otherwise slip past a char-count guard.
    const eventSizeBytes = new Blob([compressedEvent]).size;
    if (eventSizeBytes > MAX_SINGLE_EVENT_SIZE) {
      this.config.loggerProvider.warn(
        `Session replay event dropped: serialized size ${Math.round(
          eventSizeBytes / 1024,
        )} KB exceeds maximum allowed event size. If this recurs, please open a GitHub issue at https://github.com/amplitude/Amplitude-TypeScript/issues or contact Amplitude support.`,
      );
      return;
    }
    if (this.eventsManager && this.deviceId) {
      this.eventsManager.addEvent({
        event: { type: 'replay', data: compressedEvent },
        sessionId,
        deviceId: this.deviceId,
      });
    }
  };

  public addCompressedEvent = (event: eventWithTime, sessionId: string | number) => {
    if (this.worker) {
      try {
        this.worker.postMessage({ event, sessionId, gzipReplayEvents: this.gzipReplayEvents });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'DataCloneError') {
          this.worker.postMessage(JSON.stringify({ event, sessionId, gzipReplayEvents: this.gzipReplayEvents }));
        } else {
          this.config.loggerProvider.warn('Unexpected error while posting message to worker:', err);
        }
      }
      return;
    }
    if (this.gzipReplayEvents) {
      this.scheduleCompressAndStore(event, sessionId);
      return;
    }
    this.addCompressedEventToManager(serializeReplayEvent(event), sessionId);
  };

  /**
   * Synchronously drain all queued events. Called during page unload to prevent
   * data loss from events waiting in the requestIdleCallback queue.
   */
  public flushQueue = () => {
    if (this.pendingQueue.length > 0) {
      this.taskQueue.push(...this.mergeMutationTasks(this.pendingQueue.splice(0)));
    }
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        const { event, sessionId } = task;
        // Bypass the web worker: postMessage is async — during page unload the
        // worker response would never arrive and events would be silently dropped.
        if (this.gzipReplayEvents) {
          this.scheduleCompressAndStore(event, sessionId);
        } else {
          this.addCompressedEventToManager(serializeReplayEvent(event), sessionId);
        }
      }
    }
    this.isProcessing = false;
  };

  private mergeMutationTasks(tasks: TaskQueue[]): TaskQueue[] {
    const performanceConfig = this.config.performanceConfig;
    if (performanceConfig == null || !performanceConfig.mergeMutations) {
      return tasks;
    }
    if (tasks.length <= 1) return tasks;

    const result: TaskQueue[] = [];
    let i = 0;

    while (i < tasks.length) {
      const sessionId = tasks[i].sessionId;

      let j = i + 1;
      while (j < tasks.length && tasks[j].sessionId === sessionId) {
        j++;
      }

      const merged = mergeMutationEvents(tasks.slice(i, j).map((t) => t.event));
      for (const event of merged) {
        result.push({ event, sessionId });
      }

      i = j;
    }

    return result;
  }

  public terminate = () => {
    this.worker?.terminate();
  };
}
