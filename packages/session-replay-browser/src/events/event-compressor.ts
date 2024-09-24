import type { eventWithTime } from '@amplitude/rrweb-types';
import { SessionReplayJoinedConfig } from 'src/config/types';
import { SessionReplayEventsManager } from 'src/typings/session-replay';
import { pack } from '@amplitude/rrweb';
import { getGlobalScope } from '@amplitude/analytics-client-common';

interface TaskQueue {
  event: eventWithTime;
  sessionId: number;
}

export class EventCompressor {
  taskQueue: TaskQueue[] = [];
  isProcessing = false;
  eventsManager?: SessionReplayEventsManager<'replay' | 'interaction', string>;
  config: SessionReplayJoinedConfig;
  deviceId: string | undefined;
  canUseIdleCallback: boolean | undefined;

  constructor(
    eventsManager: SessionReplayEventsManager<'replay' | 'interaction', string>,
    config: SessionReplayJoinedConfig,
    deviceId: string | undefined,
  ) {
    const globalScope = getGlobalScope();
    this.canUseIdleCallback = globalScope && 'requestIdleCallback' in globalScope;
    this.eventsManager = eventsManager;
    this.config = config;
    this.deviceId = deviceId;
  }

  // Schedule processing during idle time
  public scheduleIdleProcessing(): void {
    if (!this.isProcessing) {
      this.isProcessing = true;
      requestIdleCallback(
        (idleDeadline) => {
          this.processQueue(idleDeadline);
        },
        { timeout: 2000 },
      );
    }
  }

  // Add an event to the task queue if idle callback is supported or compress the event directly
  public enqueueEvent(event: eventWithTime, sessionId: number): void {
    if (this.canUseIdleCallback && this.config.performanceConfig?.enabled) {
      this.taskQueue.push({ event, sessionId });
      this.scheduleIdleProcessing();
    } else {
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
        { timeout: 2000 },
      );
    } else {
      this.isProcessing = false;
    }
  }

  compressEvents = (event: eventWithTime) => {
    const packedEvent = pack(event);
    return JSON.stringify(packedEvent);
  };

  public addCompressedEvent = (event: eventWithTime, sessionId: number) => {
    const compressedEvent = this.compressEvents(event);

    if (this.eventsManager && this.deviceId) {
      this.eventsManager.addEvent({
        event: { type: 'replay', data: compressedEvent },
        sessionId,
        deviceId: this.deviceId,
      });
    }
  };
}
