import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { NativeModules, Platform } from 'react-native';

/*
 * Set the platform OS to mobile.
 */
Platform.OS = 'ios';

/*
 * Mock AsyncStorage
 */
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

/*
 * Mock navigator. This is what the navigator looks like on mobile.
 * In React Native there is no `window` global — the navigator lives on
 * `globalThis` — so we attach it there. (Under jsdom, `globalThis.navigator`
 * and `window.navigator` refer to the same object, so either env works.)
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line no-restricted-globals
(globalThis as unknown as { navigator: { product: string } }).navigator = { product: 'ReactNative' };

/*
 * Mock Native Module
 */
NativeModules.AmplitudeReactNative = {
  getApplicationContext: async (): Promise<Record<string, string>> => {
    // Keys here must match the NativeContext type declared in
    // src/plugins/context.ts. Previously this mock used snake_case keys
    // (`os`, `device_brand`, …) which silently fell through to the
    // navigator.userAgent fallback path. That path only worked under jsdom
    // (which provides a default userAgent); in pure-node it returned
    // `undefined` and broke the os_name assertion.
    return {
      version: '1.0.0',
      platform: 'iOS',
      osName: 'react-native-tests',
      osVersion: 'react-native-tests',
      language: 'react-native-tests',
      country: 'react-native-tests',
      deviceBrand: 'react-native-tests',
      deviceManufacturer: 'react-native-tests',
      deviceModel: 'react-native-tests',
      carrier: 'react-native-tests',
    };
  },
  getLegacySessionData: () => ({}),
  getLegacyEvents: () => [],
  removeLegacyEvent: () => ({}),
};
