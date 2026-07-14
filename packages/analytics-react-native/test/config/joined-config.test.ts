import { AutocaptureOptions, NetworkTrackingOptions, SAFE_HEADERS } from '@amplitude/analytics-core';
import { ReactNativeConfig } from '../../src/config';
import { updateReactNativeConfigWithRemoteConfig } from '../../src/config/joined-config';
import { useDefaultConfig } from '../helpers/default';

describe('joined-config', () => {
  let localConfig: ReactNativeConfig;

  beforeEach(() => {
    localConfig = useDefaultConfig({ autocapture: false });
  });

  describe('updateReactNativeConfigWithRemoteConfig', () => {
    test('should not modify local config if remote config is null', () => {
      const originalAutocapture = localConfig.autocapture;
      updateReactNativeConfigWithRemoteConfig(null, localConfig);
      expect(localConfig.autocapture).toBe(originalAutocapture);
    });

    test('should set autocapture from boolean remote autocapture', () => {
      updateReactNativeConfigWithRemoteConfig({ autocapture: true }, localConfig);
      expect(localConfig.autocapture).toBe(true);
    });

    test('should merge autocapture.sessions from remote config', () => {
      updateReactNativeConfigWithRemoteConfig(
        {
          autocapture: {
            sessions: true,
          },
        },
        localConfig,
      );
      expect(localConfig.autocapture).toEqual({
        attribution: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: false,
        sessions: true,
        webVitals: false,
        frustrationInteractions: false,
      });
    });

    test('should use remote autocapture if local autocapture is undefined', () => {
      localConfig = useDefaultConfig({});

      const remoteConfig = {
        autocapture: {
          sessions: false,
          networkTracking: true,
        },
      };

      updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(remoteConfig.autocapture);
    });

    test.each([true, false])(
      'should overwrite local autocapture if remote autocapture is boolean',
      (remoteAutocapture) => {
        localConfig = useDefaultConfig({});

        const remoteConfig = {
          autocapture: remoteAutocapture,
        };

        updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.autocapture).toStrictEqual(remoteAutocapture);
      },
    );

    test('should handle errors gracefully', () => {
      const logError = jest.spyOn(localConfig.loggerProvider, 'error');

      const remoteConfig = {
        autocapture: {
          get networkTracking() {
            throw new Error('Test error');
          },
        },
      };

      updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(logError).toHaveBeenCalledWith(
        'Failed to apply remote configuration because of error: ',
        expect.any(Error),
      );
    });

    test('should merge local and remote autocapture without elementInteractions expansion', () => {
      localConfig = useDefaultConfig({
        autocapture: true,
      });

      const remoteConfig = {
        autocapture: {
          sessions: false,
        },
      };

      const expectedAutocapture = {
        sessions: false,
        fileDownloads: true,
        formInteractions: true,
        pageViews: true,
        attribution: true,
        frustrationInteractions: true,
        webVitals: true,
      };

      updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(expectedAutocapture);
      expect(localConfig.autocapture).not.toHaveProperty('elementInteractions');
    });

    describe('networkTracking', () => {
      describe('headers', () => {
        test('should translate responseHeaders and requestHeaders to local responseHeaders and requestHeaders', () => {
          localConfig = useDefaultConfig({});

          const remoteConfig = {
            autocapture: {
              networkTracking: {
                captureRules: [
                  {
                    responseHeaders: {
                      captureSafeHeaders: true,
                      allowlist: ['content-type', 'x-fake-response-header'],
                    },
                    requestHeaders: {
                      captureSafeHeaders: true,
                      allowlist: ['content-type', 'x-fake-request-header'],
                    },
                  },
                ],
              },
            },
          };

          updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toEqual([
            ...SAFE_HEADERS,
            'content-type',
            'x-fake-response-header',
          ]);
          expect(networkTracking?.captureRules?.[0].requestHeaders).toEqual([
            ...SAFE_HEADERS,
            'content-type',
            'x-fake-request-header',
          ]);
        });

        test('should not fail if headers are malformed', () => {
          localConfig = useDefaultConfig({});

          const remoteConfig = {
            autocapture: {
              networkTracking: { captureRules: [{ responseHeaders: { allowlist: { wrong: 'type' } } }] },
            },
          };

          updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toBeUndefined();
          expect(networkTracking?.captureRules?.[0].requestHeaders).toBeUndefined();
        });
      });

      test('should merge urls and urlsRegex', () => {
        localConfig = useDefaultConfig({});

        const remoteConfig = {
          autocapture: {
            networkTracking: {
              captureRules: [
                {
                  urls: ['https://example.com/path', /path\/to/],
                  urlsRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
                },
              ],
            },
          },
        };

        updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules?.[0].urls).toEqual([
          'https://example.com/path',
          /path\/to/,
          /^https:\/\/.*\.example\.com$/,
          /.*\.amplitude\.com$/,
        ]);
      });

      test('should merge urls if urls is undefined and urlsRegex is provided', () => {
        localConfig = useDefaultConfig({});

        const remoteConfig = {
          autocapture: {
            networkTracking: {
              captureRules: [{ urlsRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'] }],
            },
          },
        };

        updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules?.[0].urls).toEqual([
          /^https:\/\/.*\.example\.com$/,
          /.*\.amplitude\.com$/,
        ]);
      });

      test('should skip and warn on invalid regex patterns', () => {
        localConfig = useDefaultConfig({});

        const remoteConfig = {
          autocapture: {
            networkTracking: {
              captureRules: [
                {
                  urlsRegex: ['^https://.*\\.example\\.com$', '***', '.*\\.amplitude\\.com$'],
                },
              ],
            },
          },
        };

        const logWarn = jest.spyOn(localConfig.loggerProvider, 'warn');

        updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules?.[0].urls).toEqual([
          /^https:\/\/.*\.example\.com$/,
          /.*\.amplitude\.com$/,
        ]);
        expect(logWarn).toHaveBeenCalledWith('Invalid regex pattern: ***', expect.any(Error));
      });

      test('should not have urls if captureRules is undefined', () => {
        localConfig = useDefaultConfig({});

        const remoteConfig = {
          autocapture: {
            networkTracking: {},
          },
        };

        updateReactNativeConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules).toBeUndefined();
      });
    });
  });
});
