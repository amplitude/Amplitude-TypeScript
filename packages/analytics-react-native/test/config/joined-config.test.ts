import { ReactNativeConfig } from '../../src/config';
import { updateReactNativeConfigWithRemoteConfig } from '../../src/config/joined-config';
import { useDefaultConfig } from '../helpers/default';

describe('joined-config', () => {
  let localConfig: ReactNativeConfig;

  beforeEach(() => {
    localConfig = useDefaultConfig({ trackingSessionEvents: false });
  });

  describe('updateReactNativeConfigWithRemoteConfig', () => {
    test('should not modify local config if remote config is null', () => {
      const originalTrackingSessionEvents = localConfig.trackingSessionEvents;
      updateReactNativeConfigWithRemoteConfig(null, localConfig);
      expect(localConfig.trackingSessionEvents).toBe(originalTrackingSessionEvents);
    });

    test('should set trackingSessionEvents from boolean autocapture', () => {
      updateReactNativeConfigWithRemoteConfig({ autocapture: true }, localConfig);
      expect(localConfig.trackingSessionEvents).toBe(true);
    });

    test('should set trackingSessionEvents from autocapture.sessions', () => {
      updateReactNativeConfigWithRemoteConfig(
        {
          autocapture: {
            sessions: true,
          },
        },
        localConfig,
      );
      expect(localConfig.trackingSessionEvents).toBe(true);
    });

    test('should leave trackingSessionEvents unchanged when sessions is absent', () => {
      updateReactNativeConfigWithRemoteConfig(
        {
          autocapture: {},
        },
        localConfig,
      );
      expect(localConfig.trackingSessionEvents).toBe(false);
    });

    test('should handle errors gracefully', () => {
      jest.spyOn(localConfig.loggerProvider, 'debug').mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      expect(() => {
        updateReactNativeConfigWithRemoteConfig({ autocapture: { sessions: true } }, localConfig);
      }).not.toThrow();
    });
  });
});
