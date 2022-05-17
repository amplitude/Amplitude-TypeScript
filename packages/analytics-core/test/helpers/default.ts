import { Config } from '@amplitude/analytics-types';
import { getDefaultConfig } from '../../src/config';

export const useDefaultConfig = (): Config => ({
  apiKey: API_KEY,
  transportProvider: {
    send: () => Promise.resolve(null),
  },
  storageProvider: {
    isEnabled: () => true,
    get: () => undefined,
    set: () => undefined,
    remove: () => undefined,
    reset: () => undefined,
    getRaw: () => undefined,
  },
  ...getDefaultConfig(),
});

export const API_KEY = 'apiKey';
export const USER_ID = 'userId';
export const DEVICE_ID = 'deviceId';
