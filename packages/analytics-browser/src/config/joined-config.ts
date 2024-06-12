import { BrowserConfig as IBrowserConfig } from '@amplitude/analytics-types';
import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { BrowserRemoteConfig } from './types';
import { RequestMetadata } from '@amplitude/analytics-core';

export class BrowserJoinedConfigGenerator {
  // Local config before generateJoinedConfig is called
  // Joined config after generateJoinedConfig is called
  config: IBrowserConfig;
  remoteConfigFetch: RemoteConfigFetch<BrowserRemoteConfig> | undefined;

  constructor(localConfig: IBrowserConfig) {
    this.config = localConfig;
    this.config.loggerProvider.debug(
      'Local configuration before merging with remote config',
      JSON.stringify(this.config, null, 2),
    );
  }
  async initialize() {
    this.remoteConfigFetch = await createRemoteConfigFetch<BrowserRemoteConfig>({
      localConfig: this.config,
      configKeys: ['analyticsSDK'],
    });
  }

  async generateJoinedConfig(): Promise<IBrowserConfig> {
    const remoteConfig =
      this.remoteConfigFetch &&
      (await this.remoteConfigFetch.getRemoteConfig('analyticsSDK', 'browserSDK', this.config.sessionId));
    this.config.loggerProvider.debug('Remote configuration:', JSON.stringify(remoteConfig, null, 2));
    if (remoteConfig && remoteConfig.defaultTracking) {
      this.config.defaultTracking = remoteConfig.defaultTracking;
    }
    this.config.loggerProvider.debug('Joined configuration: ', JSON.stringify(remoteConfig, null, 2));
    this.config.requestMetadata ??= new RequestMetadata();
    this.config.requestMetadata.sdk.metrics.histogram.remote_config_fetch_time = this.remoteConfigFetch?.fetchTime;
    return this.config;
  }
}

export const createBrowserJoinedConfigGenerator = async (localConfig: IBrowserConfig) => {
  const joinedConfigGenerator = new BrowserJoinedConfigGenerator(localConfig);
  await joinedConfigGenerator.initialize();
  return joinedConfigGenerator;
};
