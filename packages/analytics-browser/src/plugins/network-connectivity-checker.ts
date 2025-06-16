import { getGlobalScope, BeforePlugin, BrowserClient, BrowserConfig } from '@amplitude/analytics-core';

interface EventListener {
  type: 'online' | 'offline';
  handler: () => void;
}

export const networkConnectivityCheckerPlugin = (): BeforePlugin => {
  const name = '@amplitude/plugin-network-checker-browser';
  const type = 'before' as const;
  const globalScope = getGlobalScope();
  let eventListeners: EventListener[] = [];

  const addNetworkListener = (type: 'online' | 'offline', handler: () => void) => {
    /* istanbul ignore next */
    if (globalScope?.addEventListener) {
      globalScope?.addEventListener(type, handler);
      eventListeners.push({
        type,
        handler,
      });
    }
  };

  const removeNetworkListeners = () => {
    eventListeners.forEach(({ type, handler }) => {
      /* istanbul ignore next */
      globalScope?.removeEventListener(type, handler);
    });
    eventListeners = [];
  };

  const setup = async (config: BrowserConfig, amplitude: BrowserClient) => {
    if (typeof navigator === 'undefined') {
      config.loggerProvider.debug(
        'Network connectivity checker plugin is disabled because navigator is not available.',
      );
      config.offline = false;
      return;
    }

    config.offline = !navigator.onLine;

    addNetworkListener('online', () => {
      config.loggerProvider.debug('Network connectivity changed to online.');
      config.offline = false;
      // Flush immediately will cause ERR_NETWORK_CHANGED
      setTimeout(() => {
        amplitude.flush();
      }, config.flushIntervalMillis);
    });

    addNetworkListener('offline', () => {
      config.loggerProvider.debug('Network connectivity changed to offline.');
      config.offline = true;
    });
  };

  const teardown = async () => {
    removeNetworkListeners();
  };

  return {
    name,
    type,
    setup,
    teardown,
  };
};
