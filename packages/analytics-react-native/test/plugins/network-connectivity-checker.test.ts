/* eslint-disable @typescript-eslint/unbound-method */
import { NativeModules, DeviceEventEmitter } from 'react-native';
import { ReactNativeClient } from '@amplitude/analytics-core';
import * as AnalyticsCore from '@amplitude/analytics-core';
import {
  networkConnectivityCheckerPlugin,
  CONNECTIVITY_EVENT_NAME,
} from '../../src/plugins/network-connectivity-checker';
import { useDefaultConfig } from '../helpers/default';
import * as platform from '../../src/utils/platform';

/**
 * A controllable stand-in for the web global scope so the web-fallback path can
 * be exercised under both the node (test:mobile) and jsdom (test:web) suites.
 */
const createFakeGlobalScope = () => {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    scope: {
      addEventListener: jest.fn((type: string, handler: () => void) => {
        (handlers[type] = handlers[type] || []).push(handler);
      }),
      removeEventListener: jest.fn((type: string, handler: () => void) => {
        handlers[type] = (handlers[type] || []).filter((h) => h !== handler);
      }),
    } as unknown as typeof globalThis,
    trigger: (type: 'online' | 'offline') => (handlers[type] || []).forEach((handler) => handler()),
  };
};

const withNavigator = (value: { onLine: boolean } | undefined, fn: () => Promise<void>) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  // eslint-disable-next-line no-restricted-globals
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  return fn().finally(() => {
    if (descriptor) {
      // eslint-disable-next-line no-restricted-globals
      Object.defineProperty(globalThis, 'navigator', descriptor);
    }
  });
};

const createAmplitudeMock = () =>
  ({
    flush: jest.fn(() => ({ promise: Promise.resolve() })),
  } as unknown as ReactNativeClient);

describe('networkConnectivityCheckerPlugin', () => {
  const connectivityModule = NativeModules.AmplitudeReactNativeConnectivity as {
    getNetworkConnectivityStatus: jest.Mock;
    addListener: jest.Mock;
    removeListeners: jest.Mock;
  };

  afterEach(() => {
    jest.clearAllMocks();
    connectivityModule.getNetworkConnectivityStatus.mockResolvedValue({ isConnected: true });
    DeviceEventEmitter.removeAllListeners(CONNECTIVITY_EVENT_NAME);
  });

  describe('native mode', () => {
    test('seeds initial offline state from the native module (online)', async () => {
      connectivityModule.getNetworkConnectivityStatus.mockResolvedValueOnce({ isConnected: true });
      const config = useDefaultConfig();
      const plugin = networkConnectivityCheckerPlugin();

      await plugin.setup?.(config, createAmplitudeMock());

      expect(connectivityModule.getNetworkConnectivityStatus).toHaveBeenCalledTimes(1);
      expect(config.offline).toBe(false);
    });

    test('seeds initial offline state from the native module (offline)', async () => {
      connectivityModule.getNetworkConnectivityStatus.mockResolvedValueOnce({ isConnected: false });
      const config = useDefaultConfig();
      const plugin = networkConnectivityCheckerPlugin();

      await plugin.setup?.(config, createAmplitudeMock());

      expect(config.offline).toBe(true);
    });

    test('defaults to online if the initial status read rejects', async () => {
      connectivityModule.getNetworkConnectivityStatus.mockRejectedValueOnce(new Error('boom'));
      const config = useDefaultConfig();
      const plugin = networkConnectivityCheckerPlugin();

      await plugin.setup?.(config, createAmplitudeMock());

      expect(config.offline).toBe(false);
    });

    test('toggles config.offline on connectivity events', async () => {
      const config = useDefaultConfig();
      const plugin = networkConnectivityCheckerPlugin();
      await plugin.setup?.(config, createAmplitudeMock());
      expect(config.offline).toBe(false);

      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: false });
      expect(config.offline).toBe(true);

      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });
      expect(config.offline).toBe(false);
    });

    test('flushes immediately on reconnect', async () => {
      const config = useDefaultConfig();
      const amplitude = createAmplitudeMock();
      const plugin = networkConnectivityCheckerPlugin();
      await plugin.setup?.(config, amplitude);

      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: false });
      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });

      expect(amplitude.flush).toHaveBeenCalledTimes(1);
    });

    test('ignores repeated same-state events (no redundant flush)', async () => {
      const config = useDefaultConfig();
      const amplitude = createAmplitudeMock();
      const plugin = networkConnectivityCheckerPlugin();
      await plugin.setup?.(config, amplitude);

      // Already online from the initial seed; repeated "online" events are no-ops.
      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });
      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });
      expect(amplitude.flush).not.toHaveBeenCalled();

      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: false });
      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: false });
      expect(config.offline).toBe(true);

      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });
      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: true });
      expect(amplitude.flush).toHaveBeenCalledTimes(1);
    });

    test('teardown removes the native subscription', async () => {
      const config = useDefaultConfig();
      const plugin = networkConnectivityCheckerPlugin();
      await plugin.setup?.(config, createAmplitudeMock());

      await plugin.teardown?.();

      expect(connectivityModule.removeListeners).toHaveBeenCalled();
      // After teardown, further events must not mutate config.offline.
      DeviceEventEmitter.emit(CONNECTIVITY_EVENT_NAME, { isConnected: false });
      expect(config.offline).toBe(false);
    });
  });

  /*
   * Web fallback exercises `navigator.onLine` + online/offline events. The
   * global scope and navigator are mocked so this runs under both the node
   * (test:mobile) and jsdom (test:web) suites.
   */
  describe('web fallback', () => {
    let originalModule: unknown;

    beforeEach(() => {
      originalModule = NativeModules.AmplitudeReactNativeConnectivity;
      delete (NativeModules as { AmplitudeReactNativeConnectivity?: unknown }).AmplitudeReactNativeConnectivity;
      // The web branch is gated on isWeb(); force it so this runs under the
      // node (test:mobile) suite too, not just jsdom.
      jest.spyOn(platform, 'isWeb').mockReturnValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      (NativeModules as { AmplitudeReactNativeConnectivity?: unknown }).AmplitudeReactNativeConnectivity =
        originalModule;
    });

    test('tracks navigator.onLine and online/offline events', async () => {
      const { scope, trigger } = createFakeGlobalScope();
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope);

      await withNavigator({ onLine: true }, async () => {
        const config = useDefaultConfig();
        const amplitude = createAmplitudeMock();
        const plugin = networkConnectivityCheckerPlugin();

        await plugin.setup?.(config, amplitude);

        expect(config.offline).toBe(false);
        expect(scope.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
        expect(scope.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));

        trigger('offline');
        expect(config.offline).toBe(true);

        jest.useFakeTimers();
        trigger('online');
        expect(config.offline).toBe(false);
        // Web fallback delays the flush by flushIntervalMillis to avoid
        // ERR_NETWORK_CHANGED.
        expect(amplitude.flush).not.toHaveBeenCalled();
        jest.advanceTimersByTime(config.flushIntervalMillis);
        expect(amplitude.flush).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
      });
    });

    test('ignores online events while already online (no redundant flush)', async () => {
      const { scope, trigger } = createFakeGlobalScope();
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope);

      await withNavigator({ onLine: true }, async () => {
        const config = useDefaultConfig();
        const amplitude = createAmplitudeMock();
        const plugin = networkConnectivityCheckerPlugin();

        await plugin.setup?.(config, amplitude);
        expect(config.offline).toBe(false);

        jest.useFakeTimers();
        trigger('online');
        trigger('online');
        jest.advanceTimersByTime(config.flushIntervalMillis);
        expect(amplitude.flush).not.toHaveBeenCalled();
        jest.useRealTimers();
      });
    });

    test('sets offline true when navigator starts offline', async () => {
      const { scope } = createFakeGlobalScope();
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope);

      await withNavigator({ onLine: false }, async () => {
        const config = useDefaultConfig();
        const plugin = networkConnectivityCheckerPlugin();

        await plugin.setup?.(config, createAmplitudeMock());

        expect(config.offline).toBe(true);
      });
    });

    test('teardown removes web listeners', async () => {
      const { scope } = createFakeGlobalScope();
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(scope);

      await withNavigator({ onLine: true }, async () => {
        const plugin = networkConnectivityCheckerPlugin();

        await plugin.setup?.(useDefaultConfig(), createAmplitudeMock());
        await plugin.teardown?.();

        expect(scope.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
        expect(scope.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
      });
    });
  });

  /*
   * Always-online fallback when neither a native module nor a navigator is
   * available.
   */
  describe('always-online fallback', () => {
    let originalModule: unknown;

    beforeEach(() => {
      originalModule = NativeModules.AmplitudeReactNativeConnectivity;
      delete (NativeModules as { AmplitudeReactNativeConnectivity?: unknown }).AmplitudeReactNativeConnectivity;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      (NativeModules as { AmplitudeReactNativeConnectivity?: unknown }).AmplitudeReactNativeConnectivity =
        originalModule;
    });

    test('falls back to always-online when no native module and no navigator', async () => {
      await withNavigator(undefined, async () => {
        const config = useDefaultConfig();
        // Start non-default to prove the fallback resets it to online.
        config.offline = true;
        const plugin = networkConnectivityCheckerPlugin();

        await plugin.setup?.(config, createAmplitudeMock());

        expect(config.offline).toBe(false);
        // teardown is a no-op here and should not throw.
        await expect(plugin.teardown?.()).resolves.not.toThrow();
      });
    });

    // Regression: on a NATIVE app where the connectivity module is missing
    // (e.g. JS upgraded without rebuilding native, or autolink failure), RN
    // still defines a `navigator` polyfill that has no `onLine`. The plugin
    // must NOT enter the web branch and pin `offline = !undefined === true`;
    // offline mode is best-effort, so it defaults to online.
    test('native app without the connectivity module defaults to online (not stuck offline)', async () => {
      jest.spyOn(platform, 'isWeb').mockReturnValue(false);
      // React Native's navigator: defined, but no `onLine` property.
      await withNavigator({ product: 'ReactNative' } as unknown as { onLine: boolean }, async () => {
        const config = useDefaultConfig();
        // Start offline to prove the best-effort fallback resets it to online.
        config.offline = true;
        const plugin = networkConnectivityCheckerPlugin();

        await plugin.setup?.(config, createAmplitudeMock());

        expect(config.offline).toBe(false);
      });
    });
  });
});
