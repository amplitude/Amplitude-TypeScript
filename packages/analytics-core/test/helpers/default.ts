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
  plugins: [],
  ...defaultConfig,
});

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEVICE_ID = 'deviceId';

export const AMPLITUDE_SERVER_URL = 'https://api2.amplitude.com/2/httpapi';

export const EU_AMPLITUDE_SERVER_URL = 'https://api.eu.amplitude.com/2/httpapi';

export const AMPLITUDE_BATCH_SERVER_URL = 'https://api2.amplitude.com/batch';

export const EU_AMPLITUDE_BATCH_SERVER_URL = 'https://api.eu.amplitude.com/batch';
