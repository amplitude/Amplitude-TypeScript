import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { NativeModules, Platform } from 'react-native';

/*
 * Set the platform OS to mobile.
 */
Platform.OS = 'web';

/*
 * Mock AsyncStorage
 */
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

/*
 * Mock navigator. This is what the navigator looks like on mobile
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// window['navigator'] = { product: "ReactNative" }

/*
 * Mock the connectivity-only native module bridged by
 * `AmplitudeReactNativeConnectivity`. It is wired here (in addition to
 * setup-mobile) so the network-connectivity plugin's native-path tests can run
 * under the web (jsdom) suite as well. Tests that exercise the
 * `navigator.onLine` web fallback delete this module first. Tests emit
 * `AmplitudeNetworkConnectivityChanged` via `DeviceEventEmitter` (which
 * `NativeEventEmitter` delegates to under the hood).
 */
NativeModules.AmplitudeReactNativeConnectivity = {
  getNetworkConnectivityStatus: jest.fn(async (): Promise<{ isConnected: boolean }> => ({ isConnected: true })),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
