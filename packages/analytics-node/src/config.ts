import { Config, NodeOptions, NodeConfig as INodeConfig } from '@amplitude/analytics-core';
import { DEFAULT_REQUEST_TIMEOUT_MILLIS, Http } from './transports/http';

export class NodeConfig extends Config implements INodeConfig {
  requestTimeoutMillis: number;

  constructor(apiKey: string, options?: NodeOptions) {
    const requestTimeoutMillis = options?.requestTimeoutMillis ?? DEFAULT_REQUEST_TIMEOUT_MILLIS;
    super({
      transportProvider: new Http(requestTimeoutMillis),
      ...options,
      apiKey,
    });
    this.requestTimeoutMillis = requestTimeoutMillis;
  }
}

export const useNodeConfig = (apiKey: string, overrides?: NodeOptions): INodeConfig => {
  return new NodeConfig(apiKey, overrides);
};
