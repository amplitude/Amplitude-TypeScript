import { EventBridge, IEventBridge } from './event-bridge';

export class EventBridgeContainer {
  static instances: Record<string, IEventBridge> = {};
  static getInstance(instanceName: string): IEventBridge {
    if (!this.instances[instanceName]) {
      this.instances[instanceName] = new EventBridge();
    }
    return this.instances[instanceName];
  }
}
