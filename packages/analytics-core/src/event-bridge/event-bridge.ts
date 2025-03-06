import { Event } from '../event/event';
import { EventBridgeChannel } from './event-bridge-channel';

export interface IEventBridge {
  sendEvent(channel: string, event: Event): void;
  setReceiver(channel: string, receiver: IEventBridgeReceiver): void;
}

export interface IEventBridgeReceiver {
  receive(channel: string, event: Event): void;
}

export class EventBridge implements IEventBridge {
  eventBridgeChannels: Record<string, EventBridgeChannel | undefined> = {};

  sendEvent(channel: string, event: Event) {
    if (!this.eventBridgeChannels[channel]) {
      this.eventBridgeChannels[channel] = new EventBridgeChannel(channel);
    }
    (this.eventBridgeChannels[channel] as EventBridgeChannel).sendEvent(event);
  }

  setReceiver(channel: string, receiver: IEventBridgeReceiver) {
    if (!this.eventBridgeChannels[channel]) {
      this.eventBridgeChannels[channel] = new EventBridgeChannel(channel);
    }
    (this.eventBridgeChannels[channel] as EventBridgeChannel).setReceiver(receiver);
  }
}
