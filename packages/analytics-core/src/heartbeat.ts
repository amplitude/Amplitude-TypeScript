import { CoreClient } from './types/client/core-client';
import { BaseEvent } from './types/event/base-event';
import { UUID } from './utils/uuid';

export default class Heartbeat {
  private events: Map<string, BaseEvent>;
  private delayId: string;
  private interval: NodeJS.Timeout | null = null;

  constructor(private client: CoreClient, private pulse: number) {
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
    if (!event.insert_id) {
      event.insert_id = UUID();
    }
    if (!event.delay_id) {
      event.delay_id = this.delayId;
    }
    this.events.set(event.insert_id, event);

    // emit a heartbeat and restart the interval
    return await this.resetHeartbeat();
  }

  async cancel(event: BaseEvent) {
    if (event.insert_id) {
      this.events.delete(event.insert_id);
    }
    const res = await this.resetHeartbeat();
    if (this.events.size === 0 && this.interval) {
      clearInterval(this.interval);
    }
    return res;
  }

  async update(event: BaseEvent) {
    if (event.insert_id && this.events.has(event.insert_id)) {
      this.events.set(event.insert_id, event);
    }
  }
}
