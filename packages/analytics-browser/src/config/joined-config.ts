import {
  AutocaptureOptions,
  type ElementInteractionsOptions,
  BrowserConfig,
  RemoteConfig,
} from '@amplitude/analytics-core';

export interface AutocaptureOptionsRemoteConfig extends AutocaptureOptions {
  elementInteractions?: boolean | ElementInteractionsOptionsRemoteConfig;
}
export interface ElementInteractionsOptionsRemoteConfig extends ElementInteractionsOptions {
  /**
   * Related to pageUrlAllowlist but holds regex strings which will be initialized and appended to pageUrlAllowlist
   */
  pageUrlAllowlistRegex?: string[];
}

// Type alias for the remote config structure we expect (this is what comes from the filtered browserSDK config)
type RemoteConfigBrowserSDK = {
  autocapture?: AutocaptureOptionsRemoteConfig | boolean;
};

/**
 * Applies remote configuration to the browser config, merging autocapture settings.
 * This function replicates the logic from the original generateJoinedConfig method.
 */
export function applyRemoteConfig(remoteConfig: RemoteConfig | null, browserConfig: BrowserConfig): BrowserConfig {
  if (!remoteConfig) {
    return browserConfig;
  }

  try {
    browserConfig.loggerProvider.debug('Remote configuration:', JSON.stringify(remoteConfig, null, 2));

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

          const exactAllowList = transformedRcElementInteractions.pageUrlAllowlist ?? [];
          // Convert string patterns to RegExp objects, warn on invalid patterns and skip them
          const regexList = [];
          for (const pattern of typedRemoteConfig.autocapture.elementInteractions.pageUrlAllowlistRegex || []) {
            try {
              regexList.push(new RegExp(pattern));
            } catch (regexError) {
              browserConfig.loggerProvider.warn(`Invalid regex pattern: ${pattern}`, regexError);
            }
          }

          if (typeof this.config.autocapture === 'boolean') {
            this.config.autocapture = {
              attribution: this.config.autocapture,
              fileDownloads: this.config.autocapture,
              formInteractions: this.config.autocapture,
              pageViews: this.config.autocapture,
              sessions: this.config.autocapture,
              elementInteractions: this.config.autocapture,
              webVitals: this.config.autocapture,
              frustrationInteractions: this.config.autocapture,
              ...transformedAutocaptureRemoteConfig,
            };
          }
          const combinedPageUrlAllowlist = exactAllowList.concat(regexList);

          transformedRcElementInteractions.pageUrlAllowlist = combinedPageUrlAllowlist;
          delete transformedRcElementInteractions.pageUrlAllowlistRegex;
        }

        if (typeof browserConfig.autocapture === 'boolean') {
          browserConfig.autocapture = {
            attribution: browserConfig.autocapture,
            fileDownloads: browserConfig.autocapture,
            formInteractions: browserConfig.autocapture,
            pageViews: browserConfig.autocapture,
            sessions: browserConfig.autocapture,
            elementInteractions: browserConfig.autocapture,
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

    browserConfig.loggerProvider.debug('Applied remote configuration:', JSON.stringify(browserConfig, null, 2));
  } catch (e) {
    browserConfig.loggerProvider.error('Failed to apply remote configuration because of error: ', e);
  }

  return browserConfig;
}
