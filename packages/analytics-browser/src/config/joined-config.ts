import {
  AutocaptureOptions,
  type ElementInteractionsOptions,
  BrowserConfig,
  RemoteConfig,
  NetworkTrackingOptions,
  NetworkCaptureRule,
  SAFE_HEADERS,
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

export interface NetworkCaptureRuleRemoteConfig extends NetworkCaptureRule {
  /**
   * Related to urls but holds regex strings which will be initialized and appended to urls
   */
  urlsRegex?: string[];
}

export interface NetworkTrackingOptionsRemoteConfig extends NetworkTrackingOptions {
  /**
   * Related to pageUrlAllowlist but holds regex strings which will be initialized and appended to pageUrlAllowlist
   */
  captureRules?: NetworkCaptureRuleRemoteConfig[];
}

// Type alias for the remote config structure we expect (this is what comes from the filtered browserSDK config)
type RemoteConfigBrowserSDK = {
  autocapture?: AutocaptureOptionsRemoteConfig | boolean;
};

/**
 * Performs a deep transformation of a remote config object so that
 * it matches the expected schema of the local config.
 *
 * Specifically, it normalizes nested `enabled` flags into concise union types.
 *
 * ### Transformation Rules:
 * - If an object has `enabled: true`, it is replaced by the same object without the `enabled` field.
 * - If it has only `enabled: true`, it is replaced with `true`.
 * - If it has `enabled: false`, it is replaced with `false` regardless of other fields.
 *
 * ### Examples:
 * Input:  { prop: { enabled: true, hello: 'world' }}
 * Output: { prop: { hello: 'world' } }
 *
 * Input:  { prop: { enabled: true }}
 * Output: { prop: true }
 *
 * Input:  { prop: { enabled: false, hello: 'world' }}
 * Output: { prop: false }
 *
 * Input:  { prop: { hello: 'world' }}
 * Output: { prop: { hello: 'world' } } // No change
 *
 * @param config Remote config object to be transformed
 * @returns Transformed config object compatible with local schema
 */
export function translateRemoteConfigToLocal(config?: Record<string, any>) {
  // Disabling type checking rules because remote config comes from a remote source
  // and this function needs to handle any unexpected values
  /* eslint-disable @typescript-eslint/no-unsafe-member-access,
     @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-argument
 */
  if (typeof config !== 'object' || config === null) {
    return;
  }

  // translations are not applied on array properties
  if (Array.isArray(config)) {
    return;
  }

  const propertyNames = Object.keys(config);
  for (const propertyName of propertyNames) {
    try {
      const value = config[propertyName];
      // transform objects with { enabled } property to boolean | object
      if (typeof value?.enabled === 'boolean') {
        if (value.enabled) {
          // if enabled is true, set the value to the rest of the object
          // or true if the object has no other properties
          delete value.enabled;
          if (Object.keys(value).length === 0) {
            (config as any)[propertyName] = true;
          }
        } else {
          // If enabled is false, set the value to false
          (config as any)[propertyName] = false;
        }
      }

      // recursively translate properties of the value
      translateRemoteConfigToLocal(value as Record<string, any>);
    } catch (e) {
      // a failure here means that an accessor threw an error
      // so don't translate it
      // TODO(diagnostics): add a diagnostic event for this
    }
  }

  // translate remote responseHeaders and requestHeaders to local responseHeaders and requestHeaders
  if (config.autocapture?.networkTracking?.captureRules?.length) {
    for (const rule of config.autocapture.networkTracking.captureRules) {
      for (const header of ['responseHeaders', 'requestHeaders']) {
        const { captureSafeHeaders, allowlist } = rule[header] ?? {};
        if (!captureSafeHeaders && !allowlist) {
          continue;
        }
        // if allowlist is not an array, remote config contract is violated, remove it
        if (allowlist !== undefined && !Array.isArray(allowlist)) {
          delete rule[header];
          continue;
        }
        rule[header] = [...(captureSafeHeaders ? SAFE_HEADERS : []), ...(allowlist ?? [])];
      }
    }
  }
}

function mergeUrls(urlsExact: (string | RegExp)[], urlsRegex: string[] | undefined, browserConfig: BrowserConfig) {
  // Convert string patterns to RegExp objects, warn on invalid patterns and skip them
  const regexList = [];
  for (const pattern of urlsRegex ?? []) {
    try {
      regexList.push(new RegExp(pattern));
    } catch (regexError) {
      browserConfig.loggerProvider.warn(`Invalid regex pattern: ${pattern}`, regexError);
    }
  }

  return urlsExact.concat(regexList);
}

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
      JSON.stringify(remoteConfig),
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
          transformedRcElementInteractions.pageUrlAllowlist = mergeUrls(exactAllowList, urlsRegex, browserConfig);

          // clean up the regex allow list
          delete transformedRcElementInteractions.pageUrlAllowlistRegex;
        }

        // Handle Network Tracking config initialization
        if (
          typeof typedRemoteConfig.autocapture.networkTracking === 'object' &&
          typedRemoteConfig.autocapture.networkTracking !== null &&
          typedRemoteConfig.autocapture.networkTracking.captureRules?.length
        ) {
          transformedAutocaptureRemoteConfig.networkTracking = {
            ...typedRemoteConfig.autocapture.networkTracking,
          };
          const transformedRcNetworkTracking = transformedAutocaptureRemoteConfig.networkTracking;
          /* istanbul ignore next */
          const captureRules = transformedRcNetworkTracking.captureRules ?? [];
          for (const rule of captureRules) {
            rule.urls = mergeUrls(rule.urls ?? [], rule.urlsRegex, browserConfig);
            delete rule.urlsRegex;
          }
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

    browserConfig.loggerProvider.debug('Browser config after remote config update:', JSON.stringify(browserConfig));
  } catch (e) {
    browserConfig.loggerProvider.error('Failed to apply remote configuration because of error: ', e);
  }
}
