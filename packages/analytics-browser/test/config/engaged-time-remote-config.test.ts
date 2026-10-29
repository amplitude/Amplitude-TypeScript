import { RemoteConfigClient, RemoteConfig, EngagedTimeOptions } from '@amplitude/analytics-core';
import {
  AutocaptureOptionsRemoteConfig,
  PageTrackingOptionsRemoteConfig,
  updateBrowserConfigWithRemoteConfig,
} from '../../src/config/joined-config';
import { getPageViewTrackingConfig } from '../../src/default-tracking';
import { createConfigurationMock } from '../helpers/mock';

const timings: EngagedTimeOptions = {
  activityWindowMillis: 5000,
  heartbeatIntervalMillis: 15000,
  inactivityTimeoutMillis: 180000,
};

// Exercise delivery filtering and recursive enabled translation before the
// page-view plugin receives its options. Authoring design is recorded in SDK-391.
describe('engaged-time remote config contract', () => {
  test('delivers remote options to the page-view plugin configuration', () => {
    const config = createConfigurationMock({ autocapture: false });
    const client = new RemoteConfigClient('api-key', config.loggerProvider);
    const callback = jest.fn((remote: RemoteConfig | null) => updateBrowserConfigWithRemoteConfig(remote, config));
    const autocapture: AutocaptureOptionsRemoteConfig = {
      pageViews: { enabled: true, trackEngagedTime: { enabled: true, ...timings } },
    };
    client.sendCallback(
      {
        id: 'test-subscription',
        key: 'configs.analyticsSDK.browserSDK',
        deliveryMode: 'all',
        callback,
      },
      {
        remoteConfig: {
          configs: {
            analyticsSDK: {
              browserSDK: { autocapture },
            },
          },
        },
        lastFetch: new Date(),
      },
      'remote',
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(getPageViewTrackingConfig(config).trackEngagedTime).toEqual(timings);
    expect(config.defaultTracking).toEqual(config.autocapture);
  });

  test.each<{ pageViews: boolean | PageTrackingOptionsRemoteConfig; expected?: boolean | EngagedTimeOptions }>([
    { pageViews: true },
    { pageViews: false },
    { pageViews: { enabled: true } },
    { pageViews: { enabled: false } },
    { pageViews: { enabled: true, trackEngagedTime: { enabled: true } }, expected: true },
    { pageViews: { enabled: true, trackEngagedTime: { enabled: false } }, expected: false },
    { pageViews: { enabled: true, trackEngagedTime: { enabled: true, ...timings } }, expected: timings },
    { pageViews: { trackEngagedTime: true }, expected: true },
    { pageViews: { trackEngagedTime: false }, expected: false },
    { pageViews: { trackEngagedTime: {} }, expected: {} },
  ])('forwards pageViews: $pageViews', ({ pageViews, expected }) => {
    const config = createConfigurationMock({ autocapture: false });
    updateBrowserConfigWithRemoteConfig({ autocapture: { pageViews } }, config);
    expect(getPageViewTrackingConfig(config).trackEngagedTime).toEqual(expected);
  });

  test.each([undefined, false, true, { sessions: false }, { pageViews: false }])(
    'applies remote engagement when local autocapture is %p',
    (autocapture) => {
      const config = createConfigurationMock({ autocapture });
      updateBrowserConfigWithRemoteConfig(
        { autocapture: { pageViews: { enabled: true, trackEngagedTime: { enabled: true } } } },
        config,
      );
      expect(getPageViewTrackingConfig(config).trackEngagedTime).toBe(true);
    },
  );
});
