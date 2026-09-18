import { ILogger, ReactNativeStorageData, Storage } from '@amplitude/analytics-core';
import { RemoteConfigInfo, RemoteConfigStorage } from '@amplitude/analytics-core/lib/esm/remote-config/remote-config';
import { safeJsonStringify } from '@amplitude/analytics-core';

/**
 * Remote config storage backed by a caller-provided `Storage` implementation.
 * Used on React Native, where the host app supplies AsyncStorage or its own
 * persistence layer instead of `localStorage`.
 */
export class RemoteConfigCustomStorage implements RemoteConfigStorage {
  private readonly key: string;

  constructor(
    apiKey: string,
    private readonly logger: ILogger,
    private readonly storage: Storage<ReactNativeStorageData>,
  ) {
    this.key = `AMP_remote_config_${apiKey.substring(0, 10)}`;
  }

  async fetchConfig(): Promise<RemoteConfigInfo> {
    const failedRemoteConfigInfo: RemoteConfigInfo = {
      remoteConfig: null,
      lastFetch: new Date(),
    };

    let result: ReactNativeStorageData | undefined;
    try {
      result = await this.storage.get(this.key);
    } catch (error) {
      this.logger.debug('Remote config customstorage failed to access: ', error);
      return failedRemoteConfigInfo;
    }

    // The storage may be shared with other SDK data (e.g. the event queue), so
    // reject anything that is not a plain object before reading config fields.
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      this.logger.debug('Remote config customstorage gets no valid config for the key');
      return failedRemoteConfigInfo;
    }

    const remoteConfigInfo = result as RemoteConfigInfo;
    this.logger.debug(`Remote config customstorage parsed successfully: ${safeJsonStringify(remoteConfigInfo)}`);
    return {
      remoteConfig: remoteConfigInfo.remoteConfig ?? null,
      lastFetch: remoteConfigInfo.lastFetch ? new Date(remoteConfigInfo.lastFetch) : new Date(),
    };
  }

  async setConfig(config: RemoteConfigInfo): Promise<boolean> {
    try {
      await this.storage.set(this.key, config);
      this.logger.debug('Remote config customstorage set successfully.');
      return true;
    } catch (error) {
      this.logger.debug('Remote config customstorage failed to set: ', error);
      return false;
    }
  }
}
