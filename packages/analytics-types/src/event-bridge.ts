import { Event } from './event';

export interface EventBridge {
  sendEvent(channel: string, event: Event): void;
  setReceiver(channel: string, receiver: EventBridgeReceiver): void;
}

export interface EventBridgeChannel {
  sendEvent(event: Event): void;
  setReceiver(receiver: EventBridgeReceiver): void;
}

export interface EventBridgeContainer {
  getInstance(instanceName: string): EventBridge;
}

export interface EventBridgeReceiver {
  receive(channel: string, event: Event): void;
}
