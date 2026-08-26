import type { ReactNativeClient, ReactNativeConfig } from '@amplitude/analytics-core';
import { Experiment } from '@amplitude/experiment-react-native-client';
import type { Client as IExperimentClient, ExperimentClient } from '@amplitude/experiment-react-native-client';

import { ExperimentPlugin, experimentPlugin, type ExperimentPluginConfig } from '../src/experiment';

jest.mock('@amplitude/experiment-react-native-client', () => ({
  Experiment: {
    initializeWithAmplitudeAnalytics: jest.fn(),
  },
}));

const initializeWithAmplitudeAnalytics = Experiment.initializeWithAmplitudeAnalytics as jest.MockedFunction<
  typeof Experiment.initializeWithAmplitudeAnalytics
>;

describe('ExperimentPlugin', () => {
  const analyticsConfig = {
    apiKey: 'analytics-api-key',
    serverZone: 'EU',
    instanceName: 'analytics-instance',
  } as ReactNativeConfig;
  const analyticsClient = {} as ReactNativeClient;

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('stores its configuration and identifies itself as an enrichment plugin', () => {
    const config: ExperimentPluginConfig = { debug: true };
    const plugin = new ExperimentPlugin(config);

    expect(plugin.name).toBe('@amplitude/experiment-analytics-plugin');
    expect(plugin.type).toBe('enrichment');
    expect(plugin.experiment).toBeUndefined();
    expect(plugin.config).toBe(config);
  });

  test('initializes Experiment with the Analytics API key and shared configuration', async () => {
    const experimentClient = { stop: jest.fn() } as unknown as IExperimentClient;
    initializeWithAmplitudeAnalytics.mockReturnValue(experimentClient as ExperimentClient);
    const plugin = experimentPlugin({ debug: true });

    await plugin.setup(analyticsConfig, analyticsClient);

    expect(initializeWithAmplitudeAnalytics).toHaveBeenCalledWith('analytics-api-key', {
      debug: true,
      serverZone: 'EU',
      instanceName: 'analytics-instance',
    });
    expect(plugin.experiment).toBe(experimentClient);
  });

  test('uses an explicit Experiment deployment key', async () => {
    const experimentClient = { stop: jest.fn() } as unknown as IExperimentClient;
    initializeWithAmplitudeAnalytics.mockReturnValue(experimentClient as ExperimentClient);
    const plugin = experimentPlugin({ deploymentKey: 'experiment-deployment-key' });

    await plugin.setup(analyticsConfig, analyticsClient);

    expect(initializeWithAmplitudeAnalytics).toHaveBeenCalledWith('experiment-deployment-key', {
      serverZone: 'EU',
      instanceName: 'analytics-instance',
    });
  });

  test('allows explicit Experiment options to override inherited shared options', async () => {
    const experimentClient = { stop: jest.fn() } as unknown as IExperimentClient;
    initializeWithAmplitudeAnalytics.mockReturnValue(experimentClient as ExperimentClient);
    const plugin = experimentPlugin({ serverZone: 'US', instanceName: 'experiment-instance' });

    await plugin.setup(analyticsConfig, analyticsClient);

    expect(initializeWithAmplitudeAnalytics).toHaveBeenCalledWith('analytics-api-key', {
      serverZone: 'US',
      instanceName: 'experiment-instance',
    });
  });

  test('stops and releases the Experiment client during teardown', async () => {
    const stop = jest.fn();
    const experimentClient = { stop } as unknown as IExperimentClient;
    initializeWithAmplitudeAnalytics.mockReturnValue(experimentClient as ExperimentClient);
    const plugin = experimentPlugin();
    await plugin.setup(analyticsConfig, analyticsClient);

    await plugin.teardown();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(plugin.experiment).toBeUndefined();
  });

  test('can be torn down before setup', async () => {
    const plugin = experimentPlugin();

    await expect(plugin.teardown()).resolves.toBeUndefined();
  });
});
