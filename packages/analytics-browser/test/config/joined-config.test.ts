import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import {
  BrowserJoinedConfigGenerator,
  createBrowserJoinedConfigGenerator,
  BrowserRemoteConfig,
} from '../../src/config/joined-config';
import { createConfigurationMock } from '../helpers/mock';
import {
  RequestMetadata,
  BrowserConfig as IBrowserConfig,
  type BrowserConfig,
  type ElementInteractionsOptions,
} from '@amplitude/analytics-core';

jest.mock('@amplitude/analytics-remote-config', () => ({
  createRemoteConfigFetch: jest.fn(),
}));

function expectIsAutocaptureObjectWithElementInteractions(config: BrowserConfig): asserts config is BrowserConfig & {
  autocapture: BrowserConfig['autocapture'] & { elementInteractions: ElementInteractionsOptions };
} {
  expect(config).toHaveProperty('autocapture');
  expect(config.autocapture).toHaveProperty('elementInteractions');
}

describe('joined-config', () => {
  let localConfig: IBrowserConfig;
  let mockRemoteConfigFetch: RemoteConfigFetch<BrowserRemoteConfig>;
  let generator: BrowserJoinedConfigGenerator;
  const metrics = {
    fetchTimeAPISuccess: 100,
  };

  beforeEach(() => {
    localConfig = { ...createConfigurationMock(), defaultTracking: false, autocapture: false };

    mockRemoteConfigFetch = {
      getRemoteConfig: jest.fn().mockResolvedValue({
        defaultTracking: true,
        autocapture: true,
      }),
      metrics: metrics,
    };

    // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
    (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
      mockRemoteConfigFetch,
    );

    generator = new BrowserJoinedConfigGenerator(localConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('BrowserJoinedConfigGenerator', () => {
    describe('constructor', () => {
      test('should set localConfig', () => {
        expect(generator.config).toEqual(localConfig);
        expect(generator.remoteConfigFetch).toBeUndefined();
      });
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

      test('should handle getRemoteConfig error', async () => {
        const error = new Error('Mocked completeRequest error');
        (mockRemoteConfigFetch.getRemoteConfig as jest.Mock).mockRejectedValue(error);

        const logError = jest.spyOn(localConfig.loggerProvider, 'error');

        await generator.initialize();
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig).toEqual(localConfig);
        expect(logError).toHaveBeenCalledWith('Failed to fetch remote configuration because of error: ', error);
      });

      test('should merge local and remote config', async () => {
        await generator.initialize();
        expect(generator.config.defaultTracking).toBe(false);
        const joinedConfig = await generator.generateJoinedConfig();
        const expectedConfig = localConfig;
        expectedConfig.defaultTracking = true;

        expect(mockRemoteConfigFetch.getRemoteConfig).toHaveBeenCalledWith(
          'analyticsSDK',
          'browserSDK',
          localConfig.sessionId,
        );
        // expectedConfig also includes protected properties
        expect(joinedConfig).toEqual(expectedConfig);
      });

      test('should use local config if remoteConfigFetch is not set', async () => {
        expect(generator.remoteConfigFetch).toBeUndefined();
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig).toEqual(localConfig);
      });

      test.each([undefined, new RequestMetadata()])('should set requestMetadata', async (requestMetadata) => {
        await generator.initialize();
        generator.config.requestMetadata = requestMetadata;
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.requestMetadata).not.toBeUndefined();
      });

      test('should set remote config fetch time API success', async () => {
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue({
            defaultTracking: true,
            autocapture: true,
          }),
          metrics: {
            fetchTimeAPISuccess: 100,
          },
        };

        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        await generator.initialize();
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time_API_success).toBe(100);
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time_API_fail).toBe(undefined);
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time_IDB).toBe(undefined);
      });

      test('should set remote config fetch time API fail', async () => {
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue({
            defaultTracking: true,
            autocapture: true,
          }),
          metrics: {
            fetchTimeAPIFail: 100,
          },
        };

        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        await generator.initialize();
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time_API_success).toBe(
          undefined,
        );
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time_API_fail).toBe(100);
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time_IDB).toBe(undefined);
      });

      test('should convert pageUrlAllowlistRegex strings to RegExp objects and combine with pageUrlAllowlist', async () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));
        generator = new BrowserJoinedConfigGenerator(localConfig);

        const remoteConfig = {
          autocapture: {
            elementInteractions: {
              pageUrlAllowlist: ['exact-match.com', 'another-exact-match.com'],
              pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
            },
          },
        };

        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };

        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        await generator.initialize();
        const joinedConfig = await generator.generateJoinedConfig();

        // Verify the combined pageUrlAllowlist contains both exact matches and RegExp objects
        expectIsAutocaptureObjectWithElementInteractions(joinedConfig);
        const elementInteractions = joinedConfig.autocapture?.elementInteractions;

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

      test('should handle empty pageUrlAllowlist when pageUrlAllowlistRegex is provided', async () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));
        generator = new BrowserJoinedConfigGenerator(localConfig);

        const remoteConfig = {
          autocapture: {
            elementInteractions: {
              pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
            },
          },
        };

        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };

        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        await generator.initialize();
        const joinedConfig = await generator.generateJoinedConfig();

        // Verify the pageUrlAllowlist contains only RegExp objects
        expectIsAutocaptureObjectWithElementInteractions(joinedConfig);
        const elementInteractions = joinedConfig.autocapture?.elementInteractions;

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

      test('should not fail or override pageUrlAllowlist when pageUrlAllowlistRegex is undefined', async () => {
        localConfig = createConfigurationMock({});
        generator = new BrowserJoinedConfigGenerator(localConfig);

        // Define the remote configuration with an existing exact match allowlist and pageUrlAllowlistRegex as undefined
        const remoteConfig = {
          autocapture: {
            elementInteractions: {
              pageUrlAllowlist: ['existing-domain.com', 'another-domain.net'],
            },
          },
        };

        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue(remoteConfig),
          metrics: metrics,
        };

        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        // Act: Initialize the generator and generate the joined configuration
        await generator.initialize();
        const joinedConfig = await generator.generateJoinedConfig();

        // Assert: Verify that the original pageUrlAllowlist remains unchanged
        // Ensure the autocapture and elementInteractions objects exist in the joined config
        expectIsAutocaptureObjectWithElementInteractions(joinedConfig);
        const elementInteractions = joinedConfig.autocapture?.elementInteractions;
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

  describe('createBrowserJoinedConfigGenerator', () => {
    test('should create joined config generator', async () => {
      const generator = await createBrowserJoinedConfigGenerator(localConfig);

      expect(generator.config).toEqual(localConfig);
      expect(generator.remoteConfigFetch).toBe(mockRemoteConfigFetch);
    });
  });
});
