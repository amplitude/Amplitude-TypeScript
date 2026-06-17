import { CoreClient } from './types/client/core-client';
import { BaseEvent } from './types/event/base-event';
import { UUID } from './utils/uuid';

export default class Heartbeat {
  private events: Map<string, BaseEvent>;
  private delayId: string;
  private interval: NodeJS.Timeout | null = null;

  constructor(private client: CoreClient, private pulse: number, private delayTimeout: number) {
    this.events = new Map<string, BaseEvent>();
    this.delayId = UUID();
  }

  private async resetHeartbeat() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => void this.heartbeat(), this.pulse);
    return await this.heartbeat();
  }

  private async heartbeat() {
    const trackedEvents = [];
    for (const event of this.events.values()) {
      const { event_type, event_properties, ...eventOptions } = event;
      const eventPromise = this.client.track(event_type, event_properties, eventOptions).promise;
      trackedEvents.push(eventPromise);
    }
    return await Promise.all(trackedEvents);
  }

  async track(event: BaseEvent) {
    event.insert_id = event.insert_id || UUID();
    event.delay_id = event.delay_id || this.delayId;
    event.delay_timeout = event.delay_timeout || this.delayTimeout;
    this.events.set(event.insert_id, event);

    // emit a heartbeat and restart the interval
    const heartbeatResult = await this.resetHeartbeat();

    // return the result for the event that was just tracked
    return heartbeatResult.find((result) => result.event.insert_id === event.insert_id);
  }

  async trackNoDelay(event: BaseEvent) {
    event.insert_id = event.insert_id || UUID();
    event.delay_id = event.delay_id || this.delayId;
    delete event.delay_timeout;
    return this.client.track(event).promise;
  }

  async flush() {
    const trackedEvents = [];
    for (const event of this.events.values()) {
      const { event_type, event_properties, ...eventOptions } = event;
      eventOptions.delay_timeout = 0;
      const eventPromise = this.client.track(event_type, event_properties, eventOptions).promise;
      trackedEvents.push(eventPromise);
    }
    this.interval && clearInterval(this.interval);
    this.interval = null;
    this.events.clear();
    return Promise.all(trackedEvents);
  }

  async update(event: BaseEvent) {
    if (event.insert_id && this.events.has(event.insert_id)) {
      this.events.set(event.insert_id, event);
    }
  }
}
