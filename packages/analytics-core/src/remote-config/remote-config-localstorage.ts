import { RemoteConfigStorage, RemoteConfigInfo } from './remote-config';
import { ILogger } from '../logger';

export class RemoteConfigLocalstorage implements RemoteConfigStorage {
  private readonly key: string;
  private readonly logger: ILogger;

  constructor(apiKey: string, logger: ILogger) {
    this.key = `AMP_remote_config_${apiKey.substring(0, 10)}`;
    this.logger = logger;
  }

  fetchConfig(): Promise<RemoteConfigInfo> {
    const result = localStorage.getItem(this.key);
    if (result === null) {
      this.logger.debug('Remote config localstorage gets null because the key does not exist');
      return Promise.resolve({
        remoteConfig: null,
        lastFetch: new Date(),
      });
    } else {
      try {
        const remoteConfigInfo: RemoteConfigInfo = JSON.parse(result) as RemoteConfigInfo;
        this.logger.debug('Remote config localstorage get successfully.');
        return Promise.resolve({
          remoteConfig: remoteConfigInfo.remoteConfig,
          lastFetch: new Date(remoteConfigInfo.lastFetch),
        });
      } catch (error) {
        this.logger.debug('Remote config localstorage failed to get: ', error);
        return Promise.resolve({
          remoteConfig: null,
          lastFetch: new Date(),
        });
      }
    }
  }

  setConfig(config: RemoteConfigInfo): Promise<boolean> {
    try {
      localStorage.setItem(this.key, JSON.stringify(config));
      this.logger.debug('Remote config localstorage set successfully.');
      return Promise.resolve(true);
    } catch (error) {
      this.logger.debug('Remote config localstorage failed to set: ', error);
    }
    return Promise.resolve(false);
  }
}
