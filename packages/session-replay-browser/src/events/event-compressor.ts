import { getGlobalScope } from '@amplitude/analytics-core';
import { pack } from '@amplitude/rrweb-packer';
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

  constructor(
    eventsManager: SessionReplayEventsManager<'replay' | 'interaction', string>,
    config: SessionReplayJoinedConfig,
    deviceId: string | undefined,
    workerScript?: string,
  ) {
    const globalScope = getGlobalScope();
    this.canUseIdleCallback = globalScope && 'requestIdleCallback' in globalScope;
    this.eventsManager = eventsManager;
    this.config = config;
    this.deviceId = deviceId;
    this.timeout = config.performanceConfig?.timeout || DEFAULT_TIMEOUT;

    if (workerScript) {
      config.loggerProvider.log('[Experimental] Enabling web worker for compression');

      const worker = new Worker(URL.createObjectURL(new Blob([workerScript], { type: 'application/javascript' })));
      worker.onerror = (e) => {
        config.loggerProvider.error(e);
      };
      worker.onmessage = (e) => {
        const { compressedEvent, sessionId } = e.data as Record<string, string>;
        this.addCompressedEventToManager(compressedEvent, sessionId);
      };

      this.worker = worker;
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

  compressEvent = (event: eventWithTime) => {
    const packedEvent = pack(event);
    return JSON.stringify(packedEvent);
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
          throw err; // rethrow unexpected
        }
      }
    } else {
      const compressedEvent = this.compressEvent(event);
      this.addCompressedEventToManager(compressedEvent, sessionId);
    }
  };

  public terminate = () => {
    this.worker?.terminate();
  };
}
