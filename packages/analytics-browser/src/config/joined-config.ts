import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import {
  RequestMetadata,
  BrowserConfig as IBrowserConfig,
  AutocaptureOptions,
  type ElementInteractionsOptions,
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

export type BrowserRemoteConfig = {
  browserSDK: {
    autocapture?: AutocaptureOptionsRemoteConfig | boolean;
  };
};

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
    try {
      const remoteConfig =
        this.remoteConfigFetch &&
        (await this.remoteConfigFetch.getRemoteConfig('analyticsSDK', 'browserSDK', this.config.sessionId));
      this.config.loggerProvider.debug('Remote configuration:', JSON.stringify(remoteConfig, null, 2));

      // merge remoteConfig.autocapture and this.config.autocapture
      // if a field is in remoteConfig.autocapture, use that value
      // if a field is not in remoteConfig.autocapture, use the value from this.config.autocapture
      if (remoteConfig && 'autocapture' in remoteConfig) {
        if (typeof remoteConfig.autocapture === 'boolean') {
          this.config.autocapture = remoteConfig.autocapture;
        }

        if (typeof remoteConfig.autocapture === 'object') {
          const transformedAutocaptureRemoteConfig = { ...remoteConfig.autocapture };

          if (this.config.autocapture === undefined) {
            this.config.autocapture = remoteConfig.autocapture;
          }

          // Handle pageUrlAllowlistRegex conversion to RegExp objects
          if (
            typeof remoteConfig.autocapture.elementInteractions === 'object' &&
            remoteConfig.autocapture.elementInteractions?.pageUrlAllowlistRegex?.length
          ) {
            transformedAutocaptureRemoteConfig.elementInteractions = {
              ...remoteConfig.autocapture.elementInteractions,
            };
            const transformedRcElementInteractions = transformedAutocaptureRemoteConfig.elementInteractions;

            const exactAllowList = transformedRcElementInteractions.pageUrlAllowlist ?? [];
            // Convert string patterns to RegExp objects
            const regexList =
              transformedRcElementInteractions.pageUrlAllowlistRegex?.map((pattern) => new RegExp(pattern)) ?? [];

            const combinedPageUrlAllowlist = exactAllowList.concat(regexList);

            transformedRcElementInteractions.pageUrlAllowlist = combinedPageUrlAllowlist;
            delete transformedRcElementInteractions.pageUrlAllowlistRegex;
          }

          if (typeof this.config.autocapture === 'boolean') {
            this.config.autocapture = {
              attribution: this.config.autocapture,
              fileDownloads: this.config.autocapture,
              formInteractions: this.config.autocapture,
              pageViews: this.config.autocapture,
              sessions: this.config.autocapture,
              elementInteractions: this.config.autocapture,
              ...transformedAutocaptureRemoteConfig,
            };
          }

          if (typeof this.config.autocapture === 'object') {
            this.config.autocapture = {
              ...this.config.autocapture,
              ...transformedAutocaptureRemoteConfig,
            };
          }
        }

        // Override default tracking options if autocapture is updated by remote config
        this.config.defaultTracking = this.config.autocapture;
      }

      this.config.loggerProvider.debug('Joined configuration: ', JSON.stringify(this.config, null, 2));
      this.config.requestMetadata ??= new RequestMetadata();
      if (this.remoteConfigFetch?.metrics.fetchTimeAPISuccess) {
        this.config.requestMetadata.recordHistogram(
          'remote_config_fetch_time_API_success',
          this.remoteConfigFetch.metrics.fetchTimeAPISuccess,
        );
      }
      if (this.remoteConfigFetch?.metrics.fetchTimeAPIFail) {
        this.config.requestMetadata.recordHistogram(
          'remote_config_fetch_time_API_fail',
          this.remoteConfigFetch.metrics.fetchTimeAPIFail,
        );
      }
    } catch (e) {
      this.config.loggerProvider.error('Failed to fetch remote configuration because of error: ', e);
    }

    return this.config;
  }
}

export const createBrowserJoinedConfigGenerator = async (localConfig: IBrowserConfig) => {
  const joinedConfigGenerator = new BrowserJoinedConfigGenerator(localConfig);
  await joinedConfigGenerator.initialize();
  return joinedConfigGenerator;
};
