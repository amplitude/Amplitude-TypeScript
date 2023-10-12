import { Config } from '@amplitude/analytics-types';
import { getDefaultConfig } from '../../src/config';

export const useDefaultConfig = (): Config => {
  return {
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
    diagnosticProvider: {
      isDisabled: false,
      serverUrl: undefined,
      apiKey: undefined,
      track: jest.fn(),
    },
  };
};

export const API_KEY = 'apiKey';
export const USER_ID = 'userId';
export const DEVICE_ID = 'deviceId';

/*
There is no way to figure out the state of a promise with normal API.
This helper expose the state of a promise via race.
https://stackoverflow.com/a/35820220

Example:
const a = Promise.resolve();
const b = Promise.reject();
const c = new Promise(() => {});

promiseState(a).then(state => console.log(state)); // fulfilled
promiseState(b).then(state => console.log(state)); // rejected
promiseState(c).then(state => console.log(state)); // pending
*/
export function promiseState(p: Promise<any>) {
  const t = {};
  return Promise.race([p, t]).then(
    (v) => (v === t ? 'pending' : 'fulfilled'),
    () => 'rejected',
  );
}
