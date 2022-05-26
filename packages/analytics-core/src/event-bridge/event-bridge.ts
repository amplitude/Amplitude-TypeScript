import { Event, EventBridgeReceiver, EventBridge as IEventBridge } from '@amplitude/analytics-types';
import { EventBridgeChannel } from './event-bridge-channel';

export class EventBridge implements IEventBridge {
  eventBridgeChannels: Record<string, EventBridgeChannel | undefined> = {};

  sendEvent(channel: string, event: Event) {
    if (!this.eventBridgeChannels[channel]) {
      this.eventBridgeChannels[channel] = new EventBridgeChannel(channel);
    }
    (this.eventBridgeChannels[channel] as EventBridgeChannel).sendEvent(event);
  }

  setReceiver(channel: string, receiver: EventBridgeReceiver) {
    if (!this.eventBridgeChannels[channel]) {
      this.eventBridgeChannels[channel] = new EventBridgeChannel(channel);
    }
    (this.eventBridgeChannels[channel] as EventBridgeChannel).setReceiver(receiver);
  }
}
