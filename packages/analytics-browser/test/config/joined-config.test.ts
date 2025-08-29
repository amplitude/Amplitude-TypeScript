import { translateRemoteConfigToLocal, updateBrowserConfigWithRemoteConfig } from '../../src/config/joined-config';
import { createConfigurationMock } from '../helpers/mock';
import { type BrowserConfig, type ElementInteractionsOptions } from '@amplitude/analytics-core';

function expectIsAutocaptureObjectWithElementInteractions(config: BrowserConfig): asserts config is BrowserConfig & {
  autocapture: BrowserConfig['autocapture'] & { elementInteractions: ElementInteractionsOptions };
} {
  expect(config).toHaveProperty('autocapture');
  expect(config.autocapture).toHaveProperty('elementInteractions');
}

describe('joined-config', () => {
  let localConfig: BrowserConfig;

  beforeEach(() => {
    localConfig = { ...createConfigurationMock(), defaultTracking: false, autocapture: false };
  });

  describe('updateBrowserConfigWithRemoteConfig', () => {
    test('should not modify local config if remote config is null', () => {
      const originalConfig = { ...localConfig };
      updateBrowserConfigWithRemoteConfig(null, localConfig);
      expect(localConfig).toEqual(originalConfig);
    });

    test('should disable elementInteractions if remote config sets it to false', () => {
      localConfig = createConfigurationMock(
        createConfigurationMock({
          autocapture: true,
        }),
      );

      const remoteConfig = {
        autocapture: {
          elementInteractions: false,
        },
      };

      const expectedAutocapture = {
        sessions: true,
        fileDownloads: true,
        formInteractions: true,
        pageViews: true,
        attribution: true,
        elementInteractions: false,
        frustrationInteractions: true,
        webVitals: true,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(expectedAutocapture);
      expect(localConfig.defaultTracking).toStrictEqual(expectedAutocapture);
    });

    test('should disable defaultTracking if remote config sets it to false', () => {
      localConfig = createConfigurationMock(
        createConfigurationMock({
          autocapture: true,
          defaultTracking: true,
        }),
      );

      const remoteConfig = {
        autocapture: {
          fileDownloads: false,
          formInteractions: false,
          pageViews: false,
          attribution: false,
          sessions: false,
        },
      };

      const expectedAutocapture = {
        fileDownloads: false,
        formInteractions: false,
        pageViews: false,
        attribution: false,
        sessions: false,
        elementInteractions: true,
        frustrationInteractions: true,
        webVitals: true,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.defaultTracking).toStrictEqual(expectedAutocapture);
      expect(localConfig.autocapture).toStrictEqual(expectedAutocapture);
    });

    test.each([
      {
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        attribution: false,
        pageViews: false,
        frustrationInteractions: false,
        webVitals: false,
      },
      false,
    ])('should only enable elementInteractions if remote config only sets it to true', (localAutocapture) => {
      localConfig = createConfigurationMock(
        createConfigurationMock({
          autocapture: localAutocapture,
        }),
      );

      const remoteConfig = {
        autocapture: {
          elementInteractions: true,
        },
      };

      const expectedJoinedConfig = {
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        attribution: false,
        pageViews: false,
        elementInteractions: true,
        frustrationInteractions: false,
        webVitals: false,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(expectedJoinedConfig);
      expect(localConfig.defaultTracking).toStrictEqual(expectedJoinedConfig);
    });

    test('should use remote autocapture if local autocapture is undefined', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: false,
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(remoteConfig.autocapture);
      expect(localConfig.defaultTracking).toStrictEqual(remoteConfig.autocapture);
    });

    test.each([true, false])(
      'should overwrite local autocapture if remote autocapture is boolean',
      (remoteAutocapture) => {
        localConfig = createConfigurationMock(createConfigurationMock({}));

        const remoteConfig = {
          autocapture: remoteAutocapture,
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.autocapture).toStrictEqual(remoteAutocapture);
        expect(localConfig.defaultTracking).toStrictEqual(remoteAutocapture);
      },
    );

    test('should handle errors gracefully', () => {
      const logError = jest.spyOn(localConfig.loggerProvider, 'error');

      // Create a problematic remote config that will cause an error when accessed.
      // This test is necessary because RemoteConfig uses `any` type for value, allowing external
      // sources to provide malformed data with getters, functions, or other constructs
      // that could throw errors.
      const remoteConfig = {
        autocapture: {
          get elementInteractions() {
            throw new Error('Test error');
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(logError).toHaveBeenCalledWith(
        'Failed to apply remote configuration because of error: ',
        expect.any(Error),
      );
    });

    test('should merge local and remote config', () => {
      const remoteConfig = {
        autocapture: true,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toBe(true);
      expect(localConfig.defaultTracking).toBe(true);
    });

    test('should convert pageUrlAllowlistRegex strings to RegExp objects and combine with pageUrlAllowlist', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlist: ['exact-match.com', 'another-exact-match.com'],
            pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Verify the combined pageUrlAllowlist contains both exact matches and RegExp objects
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      expect(pageUrlAllowlist?.length).toBe(4);

      // First two items should be strings
      expect(pageUrlAllowlist?.[0]).toBe('exact-match.com');
      expect(pageUrlAllowlist?.[1]).toBe('another-exact-match.com');

      // Last two items should be RegExp objects
      expect(pageUrlAllowlist?.[2]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[3]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[2].toString()).toBe(new RegExp('^https://.*\\.example\\.com$').toString());
      expect(pageUrlAllowlist?.[3].toString()).toBe(new RegExp('.*\\.amplitude\\.com$').toString());

      // pageUrlAllowlistRegex should have been removed
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');
    });

    test('should handle empty pageUrlAllowlist when pageUrlAllowlistRegex is provided', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Verify the pageUrlAllowlist contains only RegExp objects
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      expect(pageUrlAllowlist?.length).toBe(2);

      // Both items should be RegExp objects
      expect(pageUrlAllowlist?.[0]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[1]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[0].toString()).toBe(new RegExp('^https://.*\\.example\\.com$').toString());
      expect(pageUrlAllowlist?.[1].toString()).toBe(new RegExp('.*\\.amplitude\\.com$').toString());

      // pageUrlAllowlistRegex should have been removed
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');
    });

    test('should skip and warn on invalid regex patterns', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '***', '.*\\.amplitude\\.com$'],
          },
        },
      };

      const logWarn = jest.spyOn(localConfig.loggerProvider, 'warn');

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Verify the pageUrlAllowlist contains only RegExp objects
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      expect(pageUrlAllowlist?.length).toBe(2);

      // Both items should be RegExp objects
      expect(pageUrlAllowlist?.[0]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[1]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[0].toString()).toBe(new RegExp('^https://.*\\.example\\.com$').toString());
      expect(pageUrlAllowlist?.[1].toString()).toBe(new RegExp('.*\\.amplitude\\.com$').toString());

      // pageUrlAllowlistRegex should have been removed
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');

      expect(logWarn).toHaveBeenCalledWith('Invalid regex pattern: ***', expect.any(Error));
    });

    test('should not fail or override pageUrlAllowlist when pageUrlAllowlistRegex is undefined', () => {
      localConfig = createConfigurationMock({});

      // Define the remote configuration with an existing exact match allowlist and pageUrlAllowlistRegex as undefined
      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlist: ['existing-domain.com', 'another-domain.net'],
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Assert: Verify that the original pageUrlAllowlist remains unchanged
      // Ensure the autocapture and elementInteractions objects exist in the joined config
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;
      expect(elementInteractions).toBeDefined();

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      // Expect the list to have the original exact match strings
      expect(pageUrlAllowlist?.length).toBe(2);

      // Verify that the elements in the allowlist are the original strings
      expect(pageUrlAllowlist?.[0]).toBe('existing-domain.com');
      expect(pageUrlAllowlist?.[1]).toBe('another-domain.net');

      // Assert: Verify that the pageUrlAllowlistRegex property has been removed (even if it was undefined)
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');
    });
  });

  describe('translateRemoteConfigToLocal', () => {
    describe('should translate property to true when', () => {
      test('enabled is true and object has no other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: true,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toBe(true);
      });
    });
    describe('should translate property to false when', () => {
      test('enabled is false and object has no other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: false,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toBe(false);
      });
      test('enabled is false and object has other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: false,
                deadClicks: true,
                rageClicks: true,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toBe(false);
      });
    });
    describe('should translate property to object when', () => {
      test('enabled is true and object has other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: true,
                deadClicks: true,
                rageClicks: true,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toEqual({
          deadClicks: true,
          rageClicks: true,
        });
      });
    });
    describe('should not translate property when', () => {
      test('property is an array', () => {
        const config = ['a', 'b', 'c'];
        translateRemoteConfigToLocal(config);
        expect(config).toEqual(['a', 'b', 'c']);
      });
      test('config is null', () => {
        const config = null;
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
        translateRemoteConfigToLocal(config as any);
        expect(config).toBeNull();
      });
      test('enabled is not present', () => {
        const config = { prop: { subprop: { hello: true, foobar: null } } };
        translateRemoteConfigToLocal(config);
        expect(config).toEqual({ prop: { subprop: { hello: true, foobar: null } } });
      });
      test('property is null', () => {
        const config = { hello: null };
        translateRemoteConfigToLocal(config);
        expect(config).toEqual({ hello: null });
      });
      test('property is a boolean', () => {
        const config = { hello: true };
        translateRemoteConfigToLocal(config);
        expect(config).toEqual({ hello: true });
      });
    });
  });
});
