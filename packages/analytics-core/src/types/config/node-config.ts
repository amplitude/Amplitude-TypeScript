import { IConfig } from './core-config';

export type NodeConfig = IConfig;

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey'>;
