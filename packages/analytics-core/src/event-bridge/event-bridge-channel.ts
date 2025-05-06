import { IEventBridgeReceiver } from './event-bridge';
import { Event } from '../types/event/event';

const QUEUE_CAPACITY = 512;

export class EventBridgeChannel {
  channel: string;
  queue: Event[] = [];
  receiver: IEventBridgeReceiver | undefined;

  constructor(channel: string) {
    this.channel = channel;
  }

  sendEvent(event: Event) {
    if (!this.receiver) {
      this.queue = [...this.queue.slice(0, QUEUE_CAPACITY), event];
      return;
    }
    this.receiver.receive(this.channel, event);
  }

  setReceiver(receiver: IEventBridgeReceiver) {
    if (this.receiver) {
      return;
    }
    this.receiver = receiver;
    const events = this.queue;
    this.queue = [];
    events.forEach((event) => {
      (this.receiver as IEventBridgeReceiver).receive(this.channel, event);
    });
  }
}
