import { BrowserConfig } from '@amplitude/analytics-core';
import { ElementSelectorRemoteConfig } from '@amplitude/element-selector';
import { DataExtractor } from './data-extractor';

/**
 * Remote-config key for the element-selector engine payload. Nested under the
 * browser SDK autocapture namespace alongside other autocapture toggles
 * (elementInteractions, frustrationInteractions, etc.). The payload shape is
 * `ElementSelectorRemoteConfig`.
 */
export const ELEMENT_SELECTOR_REMOTE_CONFIG_KEY = 'configs.analyticsSDK.browserSDK.autocapture.elementSelector';

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

  config.loggerProvider.debug(
    `@amplitude/plugin-autocapture-browser: subscribing to element-selector remote config at "${ELEMENT_SELECTOR_REMOTE_CONFIG_KEY}"`,
  );

  const subscriptionId = remoteConfigClient.subscribe(ELEMENT_SELECTOR_REMOTE_CONFIG_KEY, 'all', (remoteConfig) => {
    const payload = remoteConfig as ElementSelectorRemoteConfig | null;
    config.loggerProvider.debug('@amplitude/plugin-autocapture-browser: element-selector remote config delivered', {
      enabled: payload?.enabled ?? 'default (false)',
      hasPayload: payload !== null && payload !== undefined,
    });
    dataExtractor.updateSelectorConfig(payload, config.loggerProvider);
  });

  return () => {
    config.loggerProvider.debug(
      `@amplitude/plugin-autocapture-browser: unsubscribing from element-selector remote config (subscription ${subscriptionId})`,
    );
    remoteConfigClient.unsubscribe(subscriptionId);
  };
}
