import { BrowserConfig } from '@amplitude/analytics-core';
import { ELEMENT_SELECTOR_REMOTE_CONFIG_KEY, ElementSelectorRemoteConfig } from '@amplitude/element-selector';
import { DataExtractor } from './data-extractor';

/**
 * Remote-config key for the element-selector engine payload. Mirrors the
 * `configs.analyticsSDK.pageActions` namespace autocapture already subscribes
 * to. The payload shape is `ElementSelectorRemoteConfig`.
 */
export { ELEMENT_SELECTOR_REMOTE_CONFIG_KEY };

/**
 * Subscribe a plugin's {@link DataExtractor} to element-selector remote config.
 *
 * On each delivery, the resolved config is pushed into the extractor's engine,
 * which changes what `getElementPath` (and therefore every selector-bearing
 * autocapture event) emits. When remote config is disabled or unavailable, this
 * is a no-op and the engine stays on the dormant defaults.
 *
 * @returns an unsubscribe function when a subscription was created, otherwise
 * `undefined`.
 */
export function subscribeToElementSelectorConfig(
  config: BrowserConfig,
  dataExtractor: DataExtractor,
): (() => void) | undefined {
  const remoteConfigClient = config.remoteConfigClient;
  if (!config.fetchRemoteConfig || !remoteConfigClient) {
    return undefined;
  }

  const subscriptionId = remoteConfigClient.subscribe(ELEMENT_SELECTOR_REMOTE_CONFIG_KEY, 'all', (remoteConfig) => {
    dataExtractor.updateSelectorConfig(remoteConfig as ElementSelectorRemoteConfig | null, config.loggerProvider);
  });

  return () => {
    remoteConfigClient.unsubscribe(subscriptionId);
  };
}
