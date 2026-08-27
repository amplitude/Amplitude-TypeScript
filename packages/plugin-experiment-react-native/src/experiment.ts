import type { EnrichmentPlugin, ReactNativeClient, ReactNativeConfig } from '@amplitude/analytics-core';
import { Experiment } from '@amplitude/experiment-react-native-client';
import type { ExperimentConfig, Client as IExperimentClient } from '@amplitude/experiment-react-native-client';

/**
 * Experiment configuration with an optional deployment key.
 * Falls back to the Analytics project API key when a deployment key is not provided.
 */
export type ExperimentPluginConfig = ExperimentConfig & { deploymentKey?: string };

export class ExperimentPlugin implements EnrichmentPlugin<ReactNativeClient, ReactNativeConfig> {
  static pluginName = '@amplitude/experiment-analytics-plugin';
  name = ExperimentPlugin.pluginName;
  type = 'enrichment' as const;
  experiment?: IExperimentClient;

  constructor(public config?: ExperimentPluginConfig) {}

  async setup(config: ReactNativeConfig, _client: ReactNativeClient): Promise<void> {
    const { deploymentKey, ...experimentOptions } = this.config ?? {};
    if (experimentOptions.serverZone === undefined && config.serverZone !== undefined) {
      experimentOptions.serverZone = config.serverZone;
    }
    if (experimentOptions.instanceName === undefined && config.instanceName !== undefined) {
      experimentOptions.instanceName = config.instanceName;
    }
    this.experiment = Experiment.initializeWithAmplitudeAnalytics(deploymentKey || config.apiKey, experimentOptions);
  }

  async teardown(): Promise<void> {
    this.experiment?.stop();
    this.experiment = undefined;
  }
}

export const experimentPlugin = (config?: ExperimentPluginConfig): ExperimentPlugin => new ExperimentPlugin(config);
