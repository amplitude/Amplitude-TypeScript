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
 *
 * Use `Object.defineProperty` rather than direct assignment because Node 21+
 * defines `globalThis.navigator` as a non-writable getter. A plain assignment
 * (`globalThis.navigator = …`) throws `TypeError: Cannot set property …` in
 * strict-mode ES modules. The built-in descriptor is `configurable: true`, so
 * `defineProperty` overrides it cleanly on Node 22 / 24 while still working
 * on Node 18/20 (where the property doesn't exist yet) and under jsdom
 * (where `window.navigator` and `globalThis.navigator` alias).
 */
// eslint-disable-next-line no-restricted-globals
Object.defineProperty(globalThis, 'navigator', {
  value: { product: 'ReactNative' },
  configurable: true,
  writable: true,
});

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
      adid: 'react-native-tests',
      appSetId: 'react-native-tests',
      idfv: 'react-native-tests',
    };
  },
  getLegacySessionData: () => ({}),
  getLegacyEvents: () => [],
  removeLegacyEvent: () => ({}),
};

/*
 * Mock the connectivity-only native module bridged by
 * `AmplitudeReactNativeConnectivity`. `getNetworkConnectivityStatus` seeds the
 * initial offline state, while `addListener`/`removeListeners` are required by
 * `NativeEventEmitter`. Tests emit `AmplitudeNetworkConnectivityChanged` via
 * `DeviceEventEmitter` (which `NativeEventEmitter` delegates to under the hood).
 */
NativeModules.AmplitudeReactNativeConnectivity = {
  getNetworkConnectivityStatus: jest.fn(async (): Promise<{ isConnected: boolean }> => ({ isConnected: true })),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
