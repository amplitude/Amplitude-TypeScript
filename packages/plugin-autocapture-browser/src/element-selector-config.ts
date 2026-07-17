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

  const subscriptionId = remoteConfigClient.subscribe(
    ELEMENT_SELECTOR_REMOTE_CONFIG_KEY,
    'all',
    (remoteConfig, source) => {
      // Diagnostic: log every delivery with its source ('cache' | 'remote') and
      // payload. In 'all' mode the client delivers cache then remote, and any
      // delivery whose payload is null / missing a boolean `enabled` resolves to
      // disabled — which is how a live engine gets silently turned back off.
      config.loggerProvider.debug(
        `@amplitude/element-selector: remote-config delivery (source=${String(source)}) ${JSON.stringify(
          remoteConfig,
        )}`,
      );
      dataExtractor.updateSelectorConfig(remoteConfig as ElementSelectorRemoteConfig | null, config.loggerProvider);
    },
  );

  return () => {
    remoteConfigClient.unsubscribe(subscriptionId);
  };
}
