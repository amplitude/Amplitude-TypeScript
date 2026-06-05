import { getGlobalScope, BeforePlugin, ReactNativeClient, ReactNativeConfig } from '@amplitude/analytics-core';
import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';
import { isWeb } from '../utils/platform';

export const CONNECTIVITY_EVENT_NAME = 'AmplitudeNetworkConnectivityChanged';

/** Native `AmplitudeReactNativeConnectivity` module bridged from iOS/Android. */
interface ConnectivityNativeModule {
  getNetworkConnectivityStatus(): Promise<{ isConnected: boolean }>;
  // Required by `NativeEventEmitter`; no-ops on the JS side.
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

  const setup = async (config: ReactNativeConfig, amplitude: ReactNativeClient) => {
    const nativeModule = NativeModules.AmplitudeReactNativeConnectivity as ConnectivityNativeModule | undefined;

    const handleConnectivityChange = (isConnected: boolean) => {
      const offline = !isConnected;
      if (config.offline === offline) {
        return;
      }
      config.offline = offline;
      if (isConnected) {
        config.loggerProvider.debug('Network connectivity changed to online.');
        // No `ERR_NETWORK_CHANGED` on native, so flush immediately.
        void amplitude.flush();
      } else {
        config.loggerProvider.debug('Network connectivity changed to offline.');
      }
    };

    // Native (iOS/Android): use the bridged module.
    if (nativeModule) {
      const eventEmitter = new NativeEventEmitter(nativeModule);
      // `startObserving` only fires on changes, so seed the initial state.
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

    // Web (react-native-web): use `navigator.onLine`. Gate on `isWeb()` because
    // RN's `navigator` polyfill has no `onLine` — without this, a native app
    // missing the module would read `!undefined === true` and pin itself offline.
    if (isWeb() && typeof navigator !== 'undefined') {
      config.offline = !navigator.onLine;

      addWebNetworkListener('online', () => {
        config.loggerProvider.debug('Network connectivity changed to online.');
        config.offline = false;
        // Immediate flush on web causes ERR_NETWORK_CHANGED, so delay it.
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

    // No connectivity source (no native module, not web) → assume online.
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
