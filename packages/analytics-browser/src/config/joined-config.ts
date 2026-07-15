import {
  AutocaptureOptions,
  type ElementInteractionsOptions,
  BrowserConfig,
  CustomEnrichmentOptions,
  RemoteConfig,
  NetworkTrackingOptionsRemoteConfig,
  safeJsonStringify,
  translateRemoteConfigToLocal,
  mergeUrls,
  transformNetworkTrackingRemoteConfig,
} from '@amplitude/analytics-core';

export interface AutocaptureOptionsRemoteConfig extends AutocaptureOptions {
  elementInteractions?: boolean | ElementInteractionsOptionsRemoteConfig;
  networkTracking?: boolean | NetworkTrackingOptionsRemoteConfig;
}
export interface ElementInteractionsOptionsRemoteConfig extends ElementInteractionsOptions {
  /**
   * Related to pageUrlAllowlist but holds regex strings which will be initialized and appended to pageUrlAllowlist
   */
  pageUrlAllowlistRegex?: string[];
}

export type { NetworkCaptureRuleRemoteConfig, NetworkTrackingOptionsRemoteConfig } from '@amplitude/analytics-core';

// Type alias for the remote config structure we expect (this is what comes from the filtered browserSDK config)
type RemoteConfigBrowserSDK = {
  autocapture?: AutocaptureOptionsRemoteConfig | boolean;
  customEnrichment?: CustomEnrichmentOptions | boolean;
};

/**
 * Updates the browser config in place by applying remote configuration settings.
 * Primarily merges autocapture settings from the remote config into the browser config.
 *
 * @param remoteConfig - The remote configuration to apply, or null if none available
 * @param browserConfig - The browser config object to update (modified in place)
 */
export function updateBrowserConfigWithRemoteConfig(
  remoteConfig: RemoteConfig | null,
  browserConfig: BrowserConfig,
): void {
  if (!remoteConfig) {
    return;
  }

  // translate remote config to local compatible format
  translateRemoteConfigToLocal(remoteConfig);

  try {
    browserConfig.loggerProvider.debug(
      'Update browser config with remote configuration:',
      safeJsonStringify(remoteConfig),
    );

    // type cast error will be thrown if remoteConfig is not a valid RemoteConfigBrowserSDK
    // and it will be caught by the try-catch block
    const typedRemoteConfig = remoteConfig as RemoteConfigBrowserSDK;

    // merge remoteConfig.autocapture and browserConfig.autocapture
    // if a field is in remoteConfig.autocapture, use that value
    // if a field is not in remoteConfig.autocapture, use the value from browserConfig.autocapture
    if (typedRemoteConfig && 'autocapture' in typedRemoteConfig) {
      if (typeof typedRemoteConfig.autocapture === 'boolean') {
        browserConfig.autocapture = typedRemoteConfig.autocapture;
      }

      if (typeof typedRemoteConfig.autocapture === 'object' && typedRemoteConfig.autocapture !== null) {
        const transformedAutocaptureRemoteConfig = { ...typedRemoteConfig.autocapture };

        if (browserConfig.autocapture === undefined) {
          browserConfig.autocapture = typedRemoteConfig.autocapture;
        }

        // Handle Element Interactions config initialization
        if (
          typeof typedRemoteConfig.autocapture.elementInteractions === 'object' &&
          typedRemoteConfig.autocapture.elementInteractions !== null &&
          typedRemoteConfig.autocapture.elementInteractions.pageUrlAllowlistRegex?.length
        ) {
          transformedAutocaptureRemoteConfig.elementInteractions = {
            ...typedRemoteConfig.autocapture.elementInteractions,
          };
          const transformedRcElementInteractions = transformedAutocaptureRemoteConfig.elementInteractions;

          // combine exact allow list and regex allow list into just 'pageUrlAllowlist'
          const exactAllowList = transformedRcElementInteractions.pageUrlAllowlist ?? [];
          const urlsRegex = typedRemoteConfig.autocapture.elementInteractions.pageUrlAllowlistRegex;
          transformedRcElementInteractions.pageUrlAllowlist = mergeUrls(
            exactAllowList,
            urlsRegex,
            browserConfig.loggerProvider,
          );

          // clean up the regex allow list
          delete transformedRcElementInteractions.pageUrlAllowlistRegex;
        }

        // Handle Network Tracking config initialization
        const transformedNetworkTracking = transformNetworkTrackingRemoteConfig(
          typedRemoteConfig.autocapture.networkTracking,
          browserConfig.loggerProvider,
        );
        if (transformedNetworkTracking) {
          transformedAutocaptureRemoteConfig.networkTracking = transformedNetworkTracking;
        }

        if (typeof browserConfig.autocapture === 'boolean') {
          browserConfig.autocapture = {
            attribution: browserConfig.autocapture,
            fileDownloads: browserConfig.autocapture,
            formInteractions: browserConfig.autocapture,
            pageViews: browserConfig.autocapture,
            sessions: browserConfig.autocapture,
            elementInteractions: browserConfig.autocapture,
            webVitals: browserConfig.autocapture,
            frustrationInteractions: browserConfig.autocapture,
            ...transformedAutocaptureRemoteConfig,
          };
        }

        if (typeof browserConfig.autocapture === 'object') {
          browserConfig.autocapture = {
            ...browserConfig.autocapture,
            ...transformedAutocaptureRemoteConfig,
          };
        }
      }

      // Override default tracking options if autocapture is updated by remote config
      browserConfig.defaultTracking = browserConfig.autocapture;
    }

    if ('customEnrichment' in typedRemoteConfig && typedRemoteConfig.customEnrichment !== null) {
      // Respect a locally-explicit false: if the user disabled custom enrichment at init time,
      // remote config must not re-enable it.
      if (browserConfig.customEnrichment !== false) {
        browserConfig.customEnrichment = typedRemoteConfig.customEnrichment;
      }
    }

    browserConfig.loggerProvider.debug('Browser config after remote config update:', safeJsonStringify(browserConfig));
  } catch (e) {
    browserConfig.loggerProvider.error('Failed to apply remote configuration because of error: ', e);
  }
}
