import { EnrichmentPlugin, BrowserClient, BrowserConfig } from '@amplitude/analytics-core';

import {
  ExperimentConfig,
  Client as IExperimentClient,
  initializeWithAmplitudeAnalytics,
} from '@amplitude/experiment-js-client';

/**
 * Fallback to project API key if no experiment deployment key.
 */
export type ExperimentPluginConfig = ExperimentConfig & { deploymentKey?: string };

export class ExperimentPlugin implements EnrichmentPlugin<BrowserClient, BrowserConfig> {
  static pluginName = '@amplitude/experiment-analytics-plugin';
  name = ExperimentPlugin.pluginName;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  experiment: IExperimentClient;
  config?: ExperimentPluginConfig;

  constructor(config?: ExperimentPluginConfig) {
    this.config = config;
  }

  async setup(config: BrowserConfig, _client: BrowserClient) {
    const experimentConfig =
      this.config?.instanceName !== undefined || config.instanceName === undefined
        ? this.config
        : { ...this.config, instanceName: config.instanceName };
    this.experiment = initializeWithAmplitudeAnalytics(this.config?.deploymentKey || config.apiKey, experimentConfig);
  }
}

export const experimentPlugin: (config?: ExperimentPluginConfig) => EnrichmentPlugin<BrowserClient, BrowserConfig> = (
  config?: ExperimentPluginConfig,
) => {
  return new ExperimentPlugin(config);
};
