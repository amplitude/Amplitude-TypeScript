import { BrowserClient, BrowserConfig, EnrichmentPlugin } from '@amplitude/analytics-core';
import { AppState, NativeEventSubscription, type AppStateStatus } from 'react-native';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export const appLifecyclePlugin = (): BrowserEnrichmentPlugin => {
  let appStateListener: (status: AppStateStatus) => void;
  let unsubscribe: NativeEventSubscription;
  return {
    name: '@amplitude/plugin-app-lifecycle-react-native',
    type: 'enrichment',
    setup: async (config: BrowserConfig, client: BrowserClient) => {
      if (!AppState) {
        config.loggerProvider?.error(`'AppState' is not available in this version of React Native.
          Please report this issue to the Amplitude team.
        `);
        return;
      }
      appStateListener = (status: AppStateStatus) => {
        if (status === 'active') {
          client.track(`[Amplitude] Application Opened`);
        } else if (status === 'background') {
          client.track(`[Amplitude] Application Backgrounded`);
        }
      };
      unsubscribe = AppState.addEventListener('change', appStateListener) || {};
    },
    execute: async (event) => {
      return event;
    },
    teardown: async () => {
      if ('remove' in unsubscribe && typeof unsubscribe.remove === 'function') {
        unsubscribe.remove();
      } else if ('removeEventListener' in AppState && typeof AppState.removeEventListener === 'function') {
        AppState.removeEventListener('change', appStateListener);
      }
    },
  };
};
