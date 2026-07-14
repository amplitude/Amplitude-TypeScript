import {
  RemoteConfig,
  ReactNativeConfig,
  safeJsonStringify,
  translateRemoteConfigToLocal,
} from '@amplitude/analytics-core';

// Remote config currently delivers browserSDK-shaped payloads to React Native.
// Map the subset of fields that ReactNativeConfig supports today.
type RemoteConfigReactNativeSDK = {
  autocapture?:
    | boolean
    | {
        sessions?: boolean;
      };
};

/**
 * Updates the React Native config in place by applying remote configuration settings.
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

  translateRemoteConfigToLocal(remoteConfig);

  try {
    reactNativeConfig.loggerProvider.debug(
      'Update react native config with remote configuration:',
      safeJsonStringify(remoteConfig),
    );

    const typedRemoteConfig = remoteConfig as RemoteConfigReactNativeSDK;

    if (typedRemoteConfig && 'autocapture' in typedRemoteConfig) {
      if (typeof typedRemoteConfig.autocapture === 'boolean') {
        reactNativeConfig.trackingSessionEvents = typedRemoteConfig.autocapture;
      }

      if (typeof typedRemoteConfig.autocapture === 'object' && typedRemoteConfig.autocapture !== null) {
        if (typeof typedRemoteConfig.autocapture.sessions === 'boolean') {
          reactNativeConfig.trackingSessionEvents = typedRemoteConfig.autocapture.sessions;
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
