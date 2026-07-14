import {
  AutocaptureOptions,
  RemoteConfig,
  ReactNativeConfig,
  NetworkTrackingOptions,
  NetworkCaptureRule,
  safeJsonStringify,
  translateRemoteConfigToLocal,
} from '@amplitude/analytics-core';

export interface AutocaptureOptionsRemoteConfig extends AutocaptureOptions {
  networkTracking?: boolean | NetworkTrackingOptionsRemoteConfig;
}

export interface NetworkCaptureRuleRemoteConfig extends NetworkCaptureRule {
  /**
   * Related to urls but holds regex strings which will be initialized and appended to urls
   */
  urlsRegex?: string[];
}

export interface NetworkTrackingOptionsRemoteConfig extends NetworkTrackingOptions {
  /**
   * Related to urls but holds regex strings which will be initialized and appended to urls
   */
  captureRules?: NetworkCaptureRuleRemoteConfig[];
}

// Remote config currently delivers browserSDK-shaped payloads to React Native.
// Apply the same join/translations as browser, except elementInteractions.
type RemoteConfigReactNativeSDK = {
  autocapture?: AutocaptureOptionsRemoteConfig | boolean;
};

function mergeUrls(
  urlsExact: (string | RegExp)[],
  urlsRegex: string[] | undefined,
  reactNativeConfig: ReactNativeConfig,
) {
  // Convert string patterns to RegExp objects, warn on invalid patterns and skip them
  const regexList = [];
  for (const pattern of urlsRegex ?? []) {
    try {
      regexList.push(new RegExp(pattern));
    } catch (regexError) {
      reactNativeConfig.loggerProvider.warn(`Invalid regex pattern: ${pattern}`, regexError);
    }
  }

  return urlsExact.concat(regexList);
}

/**
 * Updates the React Native config in place by applying remote configuration settings.
 * Primarily merges autocapture settings from the remote config into the React Native config.
 * Mirrors browser remote-config joining, except elementInteractions translations.
 *
 * @param remoteConfig - The remote configuration to apply, or null if none available
 * @param reactNativeConfig - The React Native config object to update (modified in place)
 */
export function updateReactNativeConfigWithRemoteConfig(
  remoteConfig: RemoteConfig | null,
  reactNativeConfig: ReactNativeConfig,
): void {
  if (!remoteConfig) {
    return;
  }

  // translate remote config to local compatible format
  translateRemoteConfigToLocal(remoteConfig);

  try {
    reactNativeConfig.loggerProvider.debug(
      'Update react native config with remote configuration:',
      safeJsonStringify(remoteConfig),
    );

    // type cast error will be thrown if remoteConfig is not a valid RemoteConfigReactNativeSDK
    // and it will be caught by the try-catch block
    const typedRemoteConfig = remoteConfig as RemoteConfigReactNativeSDK;

    // merge remoteConfig.autocapture and reactNativeConfig.autocapture
    // if a field is in remoteConfig.autocapture, use that value
    // if a field is not in remoteConfig.autocapture, use the value from reactNativeConfig.autocapture
    if (typedRemoteConfig && 'autocapture' in typedRemoteConfig) {
      if (typeof typedRemoteConfig.autocapture === 'boolean') {
        reactNativeConfig.autocapture = typedRemoteConfig.autocapture;
      }

      if (typeof typedRemoteConfig.autocapture === 'object' && typedRemoteConfig.autocapture !== null) {
        const transformedAutocaptureRemoteConfig = { ...typedRemoteConfig.autocapture };

        if (reactNativeConfig.autocapture === undefined) {
          reactNativeConfig.autocapture = typedRemoteConfig.autocapture;
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
            rule.urls = mergeUrls(rule.urls ?? [], rule.urlsRegex, reactNativeConfig);
            delete rule.urlsRegex;
          }
        }

        if (typeof reactNativeConfig.autocapture === 'boolean') {
          reactNativeConfig.autocapture = {
            attribution: reactNativeConfig.autocapture,
            fileDownloads: reactNativeConfig.autocapture,
            formInteractions: reactNativeConfig.autocapture,
            pageViews: reactNativeConfig.autocapture,
            sessions: reactNativeConfig.autocapture,
            webVitals: reactNativeConfig.autocapture,
            frustrationInteractions: reactNativeConfig.autocapture,
            ...transformedAutocaptureRemoteConfig,
          };
        }

        if (typeof reactNativeConfig.autocapture === 'object') {
          reactNativeConfig.autocapture = {
            ...reactNativeConfig.autocapture,
            ...transformedAutocaptureRemoteConfig,
          };
        }
      }
    }

    reactNativeConfig.loggerProvider.debug(
      'React native config after remote config update:',
      safeJsonStringify(reactNativeConfig),
    );
  } catch (e) {
    reactNativeConfig.loggerProvider.error('Failed to apply remote configuration because of error: ', e);
  }
}
