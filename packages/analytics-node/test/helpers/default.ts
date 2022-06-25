import { NodeConfig as INodeConfig, InitOptions } from '@amplitude/analytics-types';

import { NodeConfig } from '../../src/config';

export const useDefaultConfig = (overrides?: Partial<InitOptions<NodeConfig>>) =>
  new NodeConfig(API_KEY, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEFAULT_OPTIONS: InitOptions<INodeConfig> = {
  apiKey: API_KEY,
  storageProvider: {
    isEnabled: async () => true,
    get: async () => undefined,
    set: async () => undefined,
    remove: async () => undefined,
    reset: async () => undefined,
    getRaw: async () => undefined,
  },
  transportProvider: {
    send: () => Promise.resolve(null),
  },
};
