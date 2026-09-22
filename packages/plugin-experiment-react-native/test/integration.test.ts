import { getAnalyticsConnector } from '@amplitude/analytics-core';
import type { ReactNativeClient, ReactNativeConfig } from '@amplitude/analytics-core';
import { Source } from '@amplitude/experiment-react-native-client';
import type { Storage } from '@amplitude/experiment-react-native-client';

import { experimentPlugin } from '../src/experiment';

describe('Experiment Analytics integration', () => {
  test('reads identity and sends exposures through the configured Analytics instance', async () => {
    jest.useFakeTimers();
    const instanceName = 'experiment-integration-instance';
    const connector = getAnalyticsConnector(instanceName);
    connector.identityStore.setIdentity({
      userId: 'experiment-user',
      deviceId: 'experiment-device',
    });
    const receiveEvent = jest.fn();
    connector.eventBridge.setEventReceiver(receiveEvent);
    const storage: Storage = {
      get: jest.fn(() => Promise.resolve(null)),
      put: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    };
    const plugin = experimentPlugin({
      instanceName,
      source: Source.InitialVariants,
      initialVariants: {
        'checkout-flow': {
          key: 'treatment',
          value: 'treatment',
          expKey: 'checkout-experiment',
        },
      },
      storage,
    });

    await plugin.setup(
      {
        apiKey: 'integration-api-key',
        instanceName,
        serverZone: 'US',
      } as ReactNativeConfig,
      {} as ReactNativeClient,
    );

    await expect(plugin.experiment?.getUserProvider().getUser()).resolves.toMatchObject({
      user_id: 'experiment-user',
      device_id: 'experiment-device',
    });
    expect(plugin.experiment?.variant('checkout-flow')).toMatchObject({
      key: 'treatment',
      value: 'treatment',
    });
    expect(receiveEvent).toHaveBeenCalledWith({
      eventType: '$exposure',
      eventProperties: {
        flag_key: 'checkout-flow',
        variant: 'treatment',
        experiment_key: 'checkout-experiment',
      },
    });
    await plugin.teardown();
    jest.useRealTimers();
  });
});
