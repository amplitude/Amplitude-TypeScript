import { getGlobalScope } from '@amplitude/analytics-core';
import { EventType as RRWebEventType } from '@amplitude/rrweb-types';
import type { eventWithTime } from '@amplitude/rrweb-types';
import { SessionReplayJoinedConfig } from '../config/types';
import { SessionReplayEventsManager } from '../typings/session-replay';

interface TaskQueue {
  event: eventWithTime;
  sessionId: string | number;
}

const DEFAULT_TIMEOUT = 2000;
export class EventCompressor {
  taskQueue: TaskQueue[] = [];
  isProcessing = false;
  eventsManager?: SessionReplayEventsManager<'replay' | 'interaction', string>;
  config: SessionReplayJoinedConfig;
  deviceId: string | undefined;
  canUseIdleCallback: boolean | undefined;
  timeout: number;
  worker?: Worker;
  onFullSnapshotProcessed?: () => void;

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
    this.timeout = config.performanceConfig?.timeout || DEFAULT_TIMEOUT;
    this.onFullSnapshotProcessed = onFullSnapshotProcessed;

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
          const { compressedEvent, sessionId } = e.data as Record<string, string>;
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
      this.config.loggerProvider.debug('Processing full snapshot immediately.');
      // Drain any events still pending in the idle-callback queue first.
      // Those events reference the pre-snapshot DOM and must be sent before
      // the full snapshot; if we let them be processed later they'd arrive at
      // the server after the snapshot and cause "node not found" replay errors.
      if (this.taskQueue.length > 0) {
        for (const task of this.taskQueue.splice(0)) {
          const compressed = this.compressEvent(task.event);
          this.addCompressedEventToManager(compressed, task.sessionId);
        }
        this.isProcessing = false;
      }
      const compressedEvent = this.compressEvent(event);
      this.addCompressedEventToManager(compressedEvent, sessionId);
      this.onFullSnapshotProcessed?.();
      return;
    }

    if (this.canUseIdleCallback && this.config.performanceConfig?.enabled) {
      this.config.loggerProvider.debug('Enqueuing event for processing during idle time.');
      this.taskQueue.push({ event, sessionId });
      this.scheduleIdleProcessing();
    } else {
      this.config.loggerProvider.debug('Processing event without idle callback.');
      this.addCompressedEvent(event, sessionId);
    }
  }

  // Process the task queue during idle time
  public processQueue(idleDeadline: IdleDeadline): void {
    // Process tasks while there's idle time or until the max number of tasks is reached
    while (this.taskQueue.length > 0 && (idleDeadline.timeRemaining() > 0 || idleDeadline.didTimeout)) {
      const task = this.taskQueue.shift();
      if (task) {
        const { event, sessionId } = task;
        this.addCompressedEvent(event, sessionId);
      }
    }

    // If there are still tasks in the queue, schedule the next idle callback
    if (this.taskQueue.length > 0) {
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

  compressEvent = (event: eventWithTime): string => {
    // Serialize with type+timestamp first for streaming parser compatibility.
    // JS engines serialize non-integer string keys in insertion order (ES2015 spec,
    // reliable across V8/SpiderMonkey/JSC), so explicit construction controls key order.
    // `delay` is an rrweb player field: an optional ms offset applied on top of
    // `timestamp` during replay to smooth out batched/throttled events. Preserve
    // it when present so playback timing is accurate.
    const { type, timestamp, delay, data } = event as eventWithTime & { delay?: number };
    return delay != null ? JSON.stringify({ type, timestamp, delay, data }) : JSON.stringify({ type, timestamp, data });
  };

  private addCompressedEventToManager = (compressedEvent: string, sessionId: string | number) => {
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
      // This indirectly compresses the event.
      try {
        this.worker.postMessage({ event, sessionId });
      } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (err.name === 'DataCloneError') {
          // fallback: serialize
          this.worker.postMessage(JSON.stringify({ event, sessionId }));
        } else {
          this.config.loggerProvider.warn('Unexpected error while posting message to worker:', err);
        }
      }
    } else {
      const compressedEvent = this.compressEvent(event);
      this.addCompressedEventToManager(compressedEvent, sessionId);
    }
  };

  /**
   * Synchronously drain all queued events. Called during page unload to prevent
   * data loss from events waiting in the requestIdleCallback queue.
   */
  public flushQueue = () => {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        const { event, sessionId } = task;
        const compressed = this.compressEvent(event);
        this.addCompressedEventToManager(compressed, sessionId);
      }
    }
    this.isProcessing = false;
  };

  public terminate = () => {
    this.worker?.terminate();
  };
}
