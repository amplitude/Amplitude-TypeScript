import { Config, NodeOptions, NodeConfig as INodeConfig } from '@amplitude/analytics-core';
import { Http } from './transports/http';

export class NodeConfig extends Config implements INodeConfig {
  constructor(apiKey: string, options?: NodeOptions) {
    super({
      transportProvider: new Http(),
      ...options,
      apiKey,
    });
  }
}

export const useNodeConfig = (apiKey: string, overrides?: NodeOptions): INodeConfig => {
  return new NodeConfig(apiKey, overrides);
};
