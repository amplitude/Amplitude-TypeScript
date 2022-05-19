import { NodeOptions, NodeConfig as INodeConfig, Event } from '@amplitude/analytics-types';
import { Config, MemoryStorage } from '@amplitude/analytics-core';
import { Http } from './transports/http';

export class NodeConfig extends Config implements INodeConfig {
  constructor(apiKey: string, options?: NodeOptions) {
    const storageProvider = options?.storageProvider ?? new MemoryStorage<Event[]>();
    const transportProvider = options?.transportProvider ?? new Http();

    super({
      ...options,
      apiKey,
      storageProvider,
      transportProvider,
    });
  }
}

export const useNodeConfig = (apiKey: string, overrides?: NodeOptions): INodeConfig => {
  return new NodeConfig(apiKey, overrides);
};
