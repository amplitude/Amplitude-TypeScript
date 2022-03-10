import { createConfig } from '../../src/config';

export const useDefaultConfig = () => createConfig(API_KEY, USER_ID, DEFAULT_OPTIONS);

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEVICE_ID = 'deviceId';

export const DEFAULT_OPTIONS = {
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
};
