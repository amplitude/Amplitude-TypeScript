import { updateBrowserConfigWithRemoteConfig } from '../../src/config/joined-config';
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

    describe('initialize', () => {
      test('should set remoteConfigFetch', async () => {
        await generator.initialize();

        expect(generator.remoteConfigFetch).not.toBeUndefined();
        expect(createRemoteConfigFetch).toHaveBeenCalledWith({
          localConfig,
          configKeys: ['analyticsSDK'],
        });
        expect(generator.remoteConfigFetch).toBe(mockRemoteConfigFetch);
      });
    });

    describe('generateJoinedConfig', () => {
      test('should disable elementInteractions if remote config sets it to false', async () => {
        localConfig = createConfigurationMock(
          createConfigurationMock({
            autocapture: true,
          }),
        );
        generator = new BrowserJoinedConfigGenerator(localConfig);
        const remoteConfig = {
          autocapture: {
            elementInteractions: false,
          },
        };
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };
        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        const expectedAutocapture = {
          sessions: true,
          fileDownloads: true,
          formInteractions: true,
          pageViews: true,
          attribution: true,
          elementInteractions: false,
          webVitals: true,
          frustrationInteractions: true,
        };

        await generator.initialize();
        expect(generator.config.autocapture).toBe(true);
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.autocapture).toStrictEqual(expectedAutocapture);
        expect(joinedConfig.defaultTracking).toStrictEqual(expectedAutocapture);
      });

      test('should disable defaultTracking if remote config sets it to false', async () => {
        localConfig = createConfigurationMock(
          createConfigurationMock({
            autocapture: true,
            defaultTracking: true,
          }),
        );
        generator = new BrowserJoinedConfigGenerator(localConfig);
        const remoteConfig = {
          autocapture: {
            fileDownloads: false,
            formInteractions: false,
            pageViews: false,
            attribution: false,
            sessions: false,
            webVitals: false,
          },
        };
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };
        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        const expectedAutocapture = {
          fileDownloads: false,
          formInteractions: false,
          pageViews: false,
          attribution: false,
          sessions: false,
          elementInteractions: true,
          webVitals: false,
          frustrationInteractions: true,
        };

        await generator.initialize();
        expect(generator.config.defaultTracking).toBe(true);
        expect(generator.config.autocapture).toBe(true);
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.defaultTracking).toStrictEqual(expectedAutocapture);
        expect(joinedConfig.autocapture).toStrictEqual(expectedAutocapture);
      });

      test.each([
        {
          sessions: false,
          fileDownloads: false,
          formInteractions: false,
          attribution: false,
          pageViews: false,
          webVitals: false,
          frustrationInteractions: false,
        },
        false,
      ])('should only enable elementInteractions if remote config only sets it to true', async (localAutocapture) => {
        localConfig = createConfigurationMock(
          createConfigurationMock({
            autocapture: localAutocapture,
          }),
        );
        generator = new BrowserJoinedConfigGenerator(localConfig);
        const remoteConfig = {
          autocapture: {
            elementInteractions: true,
          },
        };
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };
        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        const expectedJoinedConfig = {
          sessions: false,
          fileDownloads: false,
          formInteractions: false,
          attribution: false,
          pageViews: false,
          elementInteractions: true,
          webVitals: false,
          frustrationInteractions: false,
        };

        await generator.initialize();
        expect(generator.config.autocapture).toBe(localAutocapture);
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.autocapture).toStrictEqual(expectedJoinedConfig);
        expect(joinedConfig.defaultTracking).toStrictEqual(expectedJoinedConfig);
      });

      test('should use remote autocapture if local autocapture is undefined', async () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));
        generator = new BrowserJoinedConfigGenerator(localConfig);
        const remoteConfig = {
          autocapture: {
            elementInteractions: false,
          },
        };
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };
        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        await generator.initialize();
        expect(generator.config.autocapture).toBe(undefined);
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.autocapture).toStrictEqual(remoteConfig.autocapture);
        expect(joinedConfig.defaultTracking).toStrictEqual(remoteConfig.autocapture);
      });

      test.each([true, false])(
        'should overwrite local autocapture if remote autocapture is boolean',
        async (remoteAutocapture) => {
          localConfig = createConfigurationMock(createConfigurationMock({}));
          generator = new BrowserJoinedConfigGenerator(localConfig);
          const remoteConfig = {
            autocapture: remoteAutocapture,
          };
          mockRemoteConfigFetch = {
            getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
            metrics: metrics,
          };
          // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
          (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
            mockRemoteConfigFetch,
          );

          await generator.initialize();
          expect(generator.config.autocapture).toBe(undefined);
          const joinedConfig = await generator.generateJoinedConfig();
          expect(joinedConfig.autocapture).toStrictEqual(remoteAutocapture);
          expect(joinedConfig.defaultTracking).toStrictEqual(remoteAutocapture);
        },
      );
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

      // Create a problematic remote config that will cause an error
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
});
