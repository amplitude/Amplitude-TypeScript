import { IConfig } from './core-config';

export interface NodeConfig extends IConfig {
  /**
   * The maximum time in milliseconds an event upload may stay idle before it is
   * aborted and retried. Guards against uploads that never complete.
   */
  requestTimeoutMillis: number;
}

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey'>;
