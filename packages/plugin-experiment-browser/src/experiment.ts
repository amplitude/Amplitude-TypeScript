import { EnrichmentPlugin, CoreClient, IConfig, BrowserClient, BrowserConfig } from '@amplitude/analytics-core';

import {
  ExperimentConfig,
  Client as IExperimentClient,
  initializeWithAmplitudeAnalytics,
} from '@amplitude/experiment-js-client';

export class ExperimentPlugin implements EnrichmentPlugin<BrowserClient, BrowserConfig> {
  static pluginName = '@amplitude/experiment-analytics-plugin';
  name = ExperimentPlugin.pluginName;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  experiment: IExperimentClient;
  config?: ExperimentConfig;

  constructor(config?: ExperimentConfig) {
    this.config = config;
  }

  async setup(config: IConfig, _client: CoreClient) {
    this.experiment = initializeWithAmplitudeAnalytics(config.apiKey, config);
  }
}

export const experimentPlugin: (config?: ExperimentConfig) => EnrichmentPlugin<BrowserClient, BrowserConfig> = (
  config?: ExperimentConfig,
) => {
  return new ExperimentPlugin(config);
};
