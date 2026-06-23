import { ILogger } from './logger';
import { CoreClient } from './types/client/core-client';
import { BaseEvent, Delay } from './types/event/base-event';
import { Result } from './types/result';
import { UUID } from './utils/uuid';

type DelayedEvent = BaseEvent & {
  delay: Delay;
};

const EVENTS_SIZE_LIMIT = 4 * 10_000; // 4KB

export class Heartbeat {
  private events: Map<string, DelayedEvent>;
  private delayId: string;
  private interval: NodeJS.Timeout | null = null;
  private resetPromise: Promise<Result[]> | null = null;
  
  constructor(
    private client: CoreClient,
    private pulse: number,
    private delayTimeout: number,
    private logger: ILogger,
  ) {
    this.events = new Map<string, DelayedEvent>();
    this.delayId = UUID();
  }

  private async heartbeat() {
    // stop sending heartbeats if no events are queued
    if (this.events.size === 0) {
      this.stop();
      return [];
    }

    // track all of the delayed events
    const trackedEvents = [];
    for (const event of this.events.values()) {
      const { event_type, event_properties, ...eventOptions } = event;
      const eventPromise = this.client.track(event_type, event_properties, eventOptions).promise;

      // if the event has no timeout, then it's instant ingested and we can
      // delete it after it was ingested
      if (this.isInstantEvent(event)) {
        eventPromise.finally(() => this.events.delete(event.insert_id!));
      }
      trackedEvents.push(eventPromise);
    }
    return await Promise.all(trackedEvents);
  }

  private async resetHeartbeat() {
    // if a reset is already in progress, return the existing promise
    if (this.resetPromise) return await this.resetPromise;
    
    // reset the heartbeat interval
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => void this.heartbeat(), this.pulse);

    // invoke heartbeat on the next macrotask tick
    this.resetPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.heartbeat());
      }, 0);
    });
    this.resetPromise.finally(() => this.resetPromise = null);

    return await this.resetPromise;
  }

  /**
   * An instant event is one that has no delay and gets ingested immediately
   * @param event
   * @returns
   */
  private isInstantEvent(event: DelayedEvent) {
    return event.insert_id && !event.delay.timeout;
  }

  private checkEventSizeLimit(event: BaseEvent) {
    if (JSON.stringify([...this.events.values()]).length > EVENTS_SIZE_LIMIT) {
      this.logger.warn(`Heartbeat: events size limit reached, rejecting event with id=${event.insert_id}'`);
      this.events.delete(event.insert_id!);
      return false;
    }
    return true;
  }

  async track(event: BaseEvent): Promise<Result | Error | undefined> {
    if (!event.insert_id) {
      return new Error('insert_id is required on events tracked with heartbeat');
    }
    this.events.set(event.insert_id, {
      ...event,
      delay: event.delay || { id: this.delayId, timeout: this.delayTimeout },
    });
    if (!this.checkEventSizeLimit(event)) {
      return;
    }

    // emit a heartbeat, restart interval and return the result
    const heartbeatResult = await this.resetHeartbeat();
    return heartbeatResult.find((result) => result.event.insert_id === event.insert_id);
  }

  /**
   * Ingest an event with no delay
   *
   * (This is different from normal "track". It sends the events to the "/delayed" endpoint
   * so that it can be tracked in the same payload as other events, for atomicity)
   * @param event
   * @returns
   */
  async trackNoDelay(event: BaseEvent) {
    event.delay = { id: this.delayId };
    return this.track(event);
  }

  /**
   * Update an existing event
   * @param event
   */
  async update(event: BaseEvent) {
    if (event.insert_id && this.events.has(event.insert_id)) {
      this.events.set(event.insert_id, {
        ...event,
        delay: { id: this.delayId, timeout: this.delayTimeout },
      });
      if (!this.checkEventSizeLimit(event)) {
        return;
      }
    }
  }

  stop() {
    this.interval && clearInterval(this.interval);
    this.interval = null;
    this.events.clear();
  }
}

//const DEFAULT_HEARTBEAT_INTERVAL = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL = 2_000; // TODO: DO NOT MERGE THIS
const DEFAULT_HEARTBEAT_DELAY_TIMEOUT = 3_600_000;

type HeartbeatMap = Map<CoreClient, Heartbeat>;

const heartbeatMap: HeartbeatMap = new Map<CoreClient, Heartbeat>();

export function getHeartbeatInstance(client: CoreClient, logger: ILogger): Heartbeat {
  if (heartbeatMap.has(client)) {
    return heartbeatMap.get(client)!;
  } else {
    const heartbeat = new Heartbeat(client, DEFAULT_HEARTBEAT_INTERVAL, DEFAULT_HEARTBEAT_DELAY_TIMEOUT, logger);
    heartbeatMap.set(client, heartbeat);
    return heartbeat;
  }
}
