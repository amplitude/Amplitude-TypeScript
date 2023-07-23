import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { NativeModules } from 'react-native';
import { Platform } from 'react-native';

/*
 * Set the platform OS to mobile.
 */
Platform.OS = 'ios';

/*
 * Mock AsyncStorage
 */
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

/*
 * Mock navigator. This is what the navigator looks like on mobile
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line no-restricted-globals
window['navigator'] = { product: 'ReactNative' };

/*
 * Mock Native Module
 */
NativeModules.AmplitudeReactNative = {
  getApplicationContext: async (): Promise<Record<string, string>> => {
    return {
      version: '1.0.0',
      platform: 'iOS',
      os: 'react-native-tests',
      language: 'react-native-tests',
      device_brand: 'react-native-tests',
      device_manufacturer: 'react-native-tests',
      device_model: 'react-native-tests',
      carrier: 'react-native-tests',
    };
  },
  getLegacySessionData: () => ({}),
  getLegacyEvents: () => [],
  getLegacyIdentifies: () => [],
  getLegacyInterceptedIdentifies: () => [],
  removeLegacyEvent: () => ({}),
  removeLegacyIdentify: () => ({}),
  removeLegacyInterceptedIdentify: () => ({}),
};
