import { Config } from '@amplitude/analytics-types';
import { defaultConfig } from '../../src/config';

export const useDefaultConfig = (): Config => ({
  apiKey: API_KEY,
  userId: USER_ID,
  transportProvider: {
    send: () => Promise.resolve(null),
  },
  storageProvider: {
    isEnabled: () => true,
    get: () => undefined,
    set: () => undefined,
    remove: () => undefined,
    reset: () => undefined,
  },
  ...defaultConfig,
});

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEVICE_ID = 'deviceId';
