import {
  getGlobalScope,
  BeforePlugin,
  ReactNativeClient,
  ReactNativeConfig,
  OfflineDisabled,
} from '@amplitude/analytics-core';
import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';
import { isWeb } from '../utils/platform';

export const CONNECTIVITY_EVENT_NAME = 'AmplitudeNetworkConnectivityChanged';

/**
 * Shape of the native `AmplitudeReactNativeConnectivity` module bridged from
 * iOS (`RCTEventEmitter` subclass) and Android (`ReactContextBaseJavaModule`).
 */
interface ConnectivityNativeModule {
  getNetworkConnectivityStatus(): Promise<{ isConnected: boolean }>;
  // `addListener`/`removeListeners` are required by `NativeEventEmitter` so it
  // doesn't warn; they are no-ops on the JS side here.
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface ConnectivityEvent {
  isConnected: boolean;
}

interface WebEventListener {
  type: 'online' | 'offline';
  handler: () => void;
}

// `offline` is intentionally omitted from the public `ReactNativeConfig` type,
// but it exists on the underlying core `Config` instance at runtime and is what
// the shared `Destination` plugin reads to short-circuit network requests.
type OfflineConfig = ReactNativeConfig & { offline?: boolean | typeof OfflineDisabled };

export const networkConnectivityCheckerPlugin = (): BeforePlugin => {
  const name = '@amplitude/plugin-network-checker-react-native';
  const type = 'before' as const;

  const globalScope = getGlobalScope();
  let subscription: EmitterSubscription | undefined;
  let webEventListeners: WebEventListener[] = [];

  const addWebNetworkListener = (listenerType: 'online' | 'offline', handler: () => void) => {
    /* istanbul ignore else */
    if (globalScope?.addEventListener) {
      globalScope.addEventListener(listenerType, handler);
      webEventListeners.push({ type: listenerType, handler });
    }
  };

  const removeWebNetworkListeners = () => {
    webEventListeners.forEach(({ type: listenerType, handler }) => {
      /* istanbul ignore next */
      globalScope?.removeEventListener(listenerType, handler);
    });
    webEventListeners = [];
  };

  const setup = async (config: OfflineConfig, amplitude: ReactNativeClient) => {
    const nativeModule = NativeModules.AmplitudeReactNativeConnectivity as ConnectivityNativeModule | undefined;

    // Apply a connectivity change. Comparing against the current `config.offline`
    // value naturally debounces repeated same-state signals (e.g. Android's
    // `onCapabilitiesChanged` firing multiple times) so we don't flush-storm on
    // transient reconnect flapping.
    const handleConnectivityChange = (isConnected: boolean) => {
      const offline = !isConnected;
      if (config.offline === offline) {
        return;
      }
      config.offline = offline;
      if (isConnected) {
        config.loggerProvider.debug('Network connectivity changed to online.');
        // No `ERR_NETWORK_CHANGED` concern on native, so flush immediately.
        void amplitude.flush();
      } else {
        config.loggerProvider.debug('Network connectivity changed to offline.');
      }
    };

    // Native mode (iOS / Android): use the bridged connectivity module.
    if (nativeModule) {
      const eventEmitter = new NativeEventEmitter(nativeModule);
      // `startObserving` only fires on subsequent changes, so seed the initial
      // state from the native module.
      try {
        const status = await nativeModule.getNetworkConnectivityStatus();
        config.offline = !status.isConnected;
      } catch (e) {
        config.loggerProvider.debug(`Failed to read initial network connectivity status: ${String(e)}`);
        config.offline = false;
      }
      subscription = eventEmitter.addListener(CONNECTIVITY_EVENT_NAME, (event: ConnectivityEvent) => {
        handleConnectivityChange(event.isConnected);
      });
      return;
    }

    // Web mode (react-native-web): fall back to `navigator.onLine` + events.
    // Gate on `isWeb()` (not just `typeof navigator`): React Native defines a
    // `navigator` polyfill that has no `onLine`, so on a native app where the
    // connectivity module is missing (e.g. JS upgraded without rebuilding
    // native, or an autolink failure) this branch would otherwise read
    // `!navigator.onLine === !undefined === true` and wrongly pin the SDK
    // offline forever. Offline mode is best-effort: when there's no reliable
    // connectivity source we fall through to `offline = false` below.
    if (isWeb() && typeof navigator !== 'undefined') {
      config.offline = !navigator.onLine;

      addWebNetworkListener('online', () => {
        config.loggerProvider.debug('Network connectivity changed to online.');
        config.offline = false;
        // Flushing immediately on web causes ERR_NETWORK_CHANGED, so delay it.
        setTimeout(() => {
          void amplitude.flush();
        }, config.flushIntervalMillis);
      });

      addWebNetworkListener('offline', () => {
        config.loggerProvider.debug('Network connectivity changed to offline.');
        config.offline = true;
      });
      return;
    }

    // Best-effort fallback: no reliable connectivity source (no native module,
    // not web) → assume online so we never wrongly suppress sends.
    config.loggerProvider.debug(
      'Network connectivity checker plugin found no connectivity source; defaulting to online.',
    );
    config.offline = false;
  };

  const teardown = async () => {
    subscription?.remove();
    subscription = undefined;
    removeWebNetworkListeners();
  };

  return {
    name,
    type,
    setup,
    teardown,
  };
};
