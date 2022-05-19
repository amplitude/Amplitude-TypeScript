import { NodeConfig as INodeConfig, InitOptions } from '@amplitude/analytics-types';

import { NodeConfig } from '../../src/config';

export const useDefaultConfig = (overrides?: Partial<InitOptions<NodeConfig>>) =>
  new NodeConfig(API_KEY, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEFAULT_OPTIONS: InitOptions<INodeConfig> = {
  apiKey: API_KEY,
  storageProvider: {
    isEnabled: () => true,
    get: () => undefined,
    set: () => undefined,
    remove: () => undefined,
    reset: () => undefined,
    getRaw: () => undefined,
  },
  transportProvider: {
    send: () => Promise.resolve(null),
  },
};
