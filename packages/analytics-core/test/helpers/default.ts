import { Config } from '@amplitude/analytics-types';
import { getDefaultConfig } from '../../src/config';

export const useDefaultConfig = (): Config => ({
  apiKey: API_KEY,
  transportProvider: {
    send: () => Promise.resolve(null),
  },
  storageProvider: {
    isEnabled: async () => true,
    get: async () => undefined,
    set: async () => undefined,
    remove: async () => undefined,
    reset: async () => undefined,
    getRaw: async () => undefined,
  },
  ...getDefaultConfig(),
});

export const API_KEY = 'apiKey';
export const USER_ID = 'userId';
export const DEVICE_ID = 'deviceId';
