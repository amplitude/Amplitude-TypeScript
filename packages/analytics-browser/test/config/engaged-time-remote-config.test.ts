import { RemoteConfigClient, RemoteConfig, EngagedTimeOptions } from '@amplitude/analytics-core';
import { AutocaptureOptionsRemoteConfig, updateBrowserConfigWithRemoteConfig } from '../../src/config/joined-config';
import { getEngagedTimeTrackingConfig, isEngagedTimeTrackingEnabled } from '../../src/default-tracking';
import { createConfigurationMock } from '../helpers/mock';

const engagementOptions: EngagedTimeOptions = {
  pageViewEventType: 'page_view',
  secondaryPageViewEventType: 'Engagement Resumed',
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
      engagedTimeTracking: { enabled: true, ...engagementOptions },
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
    expect(getEngagedTimeTrackingConfig(config)).toEqual(engagementOptions);
    expect(config.autocapture).toMatchObject({ pageViews: false });
    expect(config.defaultTracking).toEqual(config.autocapture);
  });
  test('replaces local secondary naming rather than merging it into remote primary options', () => {
    const config = createConfigurationMock({
      autocapture: { pageViews: false, engagedTimeTracking: engagementOptions },
    });
    updateBrowserConfigWithRemoteConfig(
      {
        autocapture: {
          engagedTimeTracking: {
            enabled: true,
            pageViewEventType: 'remote_page',
          },
        },
      },
      config,
    );
    expect(getEngagedTimeTrackingConfig(config)).toEqual({ pageViewEventType: 'remote_page' });
  });
  test('preserves local secondary naming when the remote engagement setting is omitted', () => {
    const config = createConfigurationMock({ autocapture: { engagedTimeTracking: engagementOptions } });
    updateBrowserConfigWithRemoteConfig({ autocapture: { pageViews: false } }, config);
    expect(getEngagedTimeTrackingConfig(config)).toEqual(engagementOptions);
  });
  test.each([undefined, false, true, { sessions: false }, { pageViews: false }])(
    'applies remote engagement independently of local autocapture=%p',
    (autocapture) => {
      const config = createConfigurationMock({ autocapture });
      updateBrowserConfigWithRemoteConfig({ autocapture: { engagedTimeTracking: { enabled: true } } }, config);
      expect(getEngagedTimeTrackingConfig(config)).toBeUndefined();
      expect(isEngagedTimeTrackingEnabled(config.autocapture)).toBe(true);
    },
  );
  test.each([
    { remote: true, expected: undefined },
    { remote: false, expected: undefined },
    { remote: { enabled: true }, expected: undefined },
    { remote: { enabled: false, ...engagementOptions }, expected: undefined },
    {
      remote: { enabled: true, secondaryPageViewEventType: 'Engagement Resumed' },
      expected: { secondaryPageViewEventType: 'Engagement Resumed' },
    },
    { remote: { enabled: true, ...engagementOptions }, expected: engagementOptions },
    {
      remote: { enabled: true, pageViewEventType: 'page_view', inactivityTimeoutMillis: 1000 },
      expected: { pageViewEventType: 'page_view', inactivityTimeoutMillis: 1000 },
    },
  ])('translates independent remote setting $remote', ({ remote, expected }) => {
    const config = createConfigurationMock({ autocapture: false });
    updateBrowserConfigWithRemoteConfig({ autocapture: { pageViews: false, engagedTimeTracking: remote } }, config);
    expect(getEngagedTimeTrackingConfig(config)).toEqual(expected);
    expect(isEngagedTimeTrackingEnabled(config.autocapture)).toBe(
      remote !== false && !(typeof remote === 'object' && remote.enabled === false),
    );
    expect(config.autocapture).toMatchObject({ pageViews: false });
  });
});
