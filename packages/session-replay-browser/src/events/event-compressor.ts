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
  /** Serializes delivery to eventsManager so async zlib cannot reorder events. */
  private encodeDeliveryChain = Promise.resolve();
  private workerFlushResolve?: () => void;

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
          const data = e.data as { flushed?: boolean; compressedEvent?: string; sessionId?: string | number };
          if (data.flushed) {
            if (this.workerFlushResolve) {
              this.workerFlushResolve();
            }
            return;
          }
          const { compressedEvent, sessionId } = data;
          if (compressedEvent == null || sessionId == null) {
            return;
          }
          this.encodeDeliveryChain = this.encodeDeliveryChain.then(() => {
            this.addCompressedEventToManager(compressedEvent, sessionId);
          });
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
        void this.processFullSnapshotImmediatelyAsync(event, sessionId);
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

  private waitForEncoderIdle = async (): Promise<void> => {
    await this.encodeDeliveryChain;
    const worker = this.worker;
    if (worker) {
      await new Promise<void>((resolve) => {
        this.workerFlushResolve = resolve;
        worker.postMessage({ flush: true });
      });
      this.workerFlushResolve = undefined;
      await this.encodeDeliveryChain;
    }
  };

  private encodeAndStore = async (event: eventWithTime, sessionId: string | number, compress: boolean) => {
    const scope = getGlobalScope();
    const compressed = await encodeReplayEventForStorage(event, { compress, scope });
    this.addCompressedEventToManager(compressed, sessionId);
  };

  private scheduleEncodeAndStore = (event: eventWithTime, sessionId: string | number) => {
    this.encodeDeliveryChain = this.encodeDeliveryChain.then(() =>
      this.encodeAndStore(event, sessionId, this.gzipReplayEvents),
    );
  };

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
    if (this.onFullSnapshotProcessed) {
      this.onFullSnapshotProcessed();
    }
  };

  private processFullSnapshotImmediatelyAsync = async (event: eventWithTime, sessionId: string | number) => {
    this.config.loggerProvider.debug('Processing full snapshot immediately.');
    this.isProcessing = true;
    await this.waitForEncoderIdle();

    if (this.taskQueue.length > 0 || this.pendingQueue.length > 0) {
      const allTasks = [...this.taskQueue.splice(0), ...this.mergeMutationTasks(this.pendingQueue.splice(0))];
      for (const task of allTasks) {
        await this.encodeAndStore(task.event, task.sessionId, true);
      }
    }
    await this.encodeAndStore(event, sessionId, true);
    this.isProcessing = false;
    if (this.onFullSnapshotProcessed) {
      this.onFullSnapshotProcessed();
    }
  };

  // Process the task queue during idle time
  public processQueue(idleDeadline: IdleDeadline): void {
    if (this.pendingQueue.length > 0) {
      this.taskQueue.push(...this.mergeMutationTasks(this.pendingQueue.splice(0)));
    }
    while (this.taskQueue.length > 0 && (idleDeadline.timeRemaining() > 0 || idleDeadline.didTimeout)) {
      const task = this.taskQueue.shift();
      if (task) {
        const { event, sessionId } = task;
        this.addCompressedEvent(event, sessionId);
      }
    }

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

  private postToCompressionWorker = (event: eventWithTime, sessionId: string | number) => {
    const worker = this.worker;
    if (!worker) {
      return;
    }
    const payload = { event, sessionId, gzipReplayEvents: this.gzipReplayEvents };
    try {
      worker.postMessage(payload);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'DataCloneError') {
        worker.postMessage(JSON.stringify(payload));
      } else {
        this.config.loggerProvider.warn('Unexpected error while posting message to worker:', err);
      }
    }
  };

  public addCompressedEvent = (event: eventWithTime, sessionId: string | number) => {
    if (this.worker) {
      this.postToCompressionWorker(event, sessionId);
      return;
    }
    if (this.gzipReplayEvents) {
      this.scheduleEncodeAndStore(event, sessionId);
      return;
    }
    const compressedEvent = serializeReplayEvent(event);
    this.addCompressedEventToManager(compressedEvent, sessionId);
  };

  public flushQueue = () => {
    if (this.pendingQueue.length > 0) {
      this.taskQueue.push(...this.mergeMutationTasks(this.pendingQueue.splice(0)));
    }
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        const { event, sessionId } = task;
        const compressed = serializeReplayEvent(event);
        this.addCompressedEventToManager(compressed, sessionId);
      }
    }
    this.isProcessing = false;
  };

  private mergeMutationTasks(tasks: TaskQueue[]): TaskQueue[] {
    const performanceConfig = this.config.performanceConfig;
    if (performanceConfig === undefined || !performanceConfig.mergeMutations) {
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
    if (this.worker) {
      this.worker.terminate();
    }
  };
}
