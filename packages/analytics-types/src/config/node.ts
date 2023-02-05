import { Config } from './core';

export type NodeConfig = Config;

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey'>;
