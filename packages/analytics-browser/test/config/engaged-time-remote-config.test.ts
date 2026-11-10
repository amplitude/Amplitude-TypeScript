import { RemoteConfigClient, RemoteConfig, EngagedTimeOptions } from '@amplitude/analytics-core';
import { AutocaptureOptionsRemoteConfig, updateBrowserConfigWithRemoteConfig } from '../../src/config/joined-config';
import { getEngagedTimeTrackingConfig } from '../../src/default-tracking';
import { createConfigurationMock } from '../helpers/mock';

const timings: EngagedTimeOptions = {
  activityWindowMillis: 5000,
  heartbeatIntervalMillis: 15000,
  inactivityTimeoutMillis: 180000,
};

describe('independent engaged-time remote config contract', () => {
  test('delivers the sibling engagement option without enabling pageViews', () => {
    const config = createConfigurationMock({ autocapture: false });
    const client = new RemoteConfigClient('api-key', config.loggerProvider);
    const callback = jest.fn((remote: RemoteConfig | null) => updateBrowserConfigWithRemoteConfig(remote, config));
    const autocapture: AutocaptureOptionsRemoteConfig = {
      pageViews: false,
      engagedTimeTracking: { enabled: true, ...timings },
    };
    client.sendCallback(
      { id: 'test-subscription', key: 'configs.analyticsSDK.browserSDK', deliveryMode: 'all', callback },
      {
        remoteConfig: { configs: { analyticsSDK: { browserSDK: { autocapture } } } },
        lastFetch: new Date(),
      },
      'remote',
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(getEngagedTimeTrackingConfig(config)).toEqual(timings);
    expect(config.autocapture).toMatchObject({ pageViews: false });
    expect(config.defaultTracking).toEqual(config.autocapture);
  });
  test.each([undefined, false, true, { sessions: false }, { pageViews: false }])(
    'applies remote engagement independently of local autocapture=%p',
    (autocapture) => {
      const config = createConfigurationMock({ autocapture });
      updateBrowserConfigWithRemoteConfig({ autocapture: { engagedTimeTracking: { enabled: true } } }, config);
      expect(getEngagedTimeTrackingConfig(config)).toEqual({});
    },
  );
});
