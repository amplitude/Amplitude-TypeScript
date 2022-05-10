import { NodeOptions, NodeConfig as INodeConfig, Event } from '@amplitude/analytics-types';
import { Config, Http, MemoryStorage, UUID } from '@amplitude/analytics-core';

export class NodeConfig extends Config implements INodeConfig {
  constructor(apiKey: string, userId?: string, options?: NodeOptions) {
    const storageProvider = createEventsStorage();
    const transportProvider = createTransport();

    super({
      ...options,
      apiKey,
      storageProvider,
      transportProvider,
      userId: userId,
      deviceId: createDeviceId(),
      sessionId: createSessionId(),
    });
  }
}

export const useNodeConfig = (apiKey: string, userId?: string, overrides?: NodeOptions): INodeConfig => {
  return new NodeConfig(apiKey, userId, overrides);
};

export const createEventsStorage = () => {
  const eventsStorage = new MemoryStorage<Event[]>();
  return eventsStorage;
};

export const createDeviceId = () => {
  return UUID();
};

export const createSessionId = () => {
  return Date.now();
};

export const createTransport = () => {
  return new Http();
};
