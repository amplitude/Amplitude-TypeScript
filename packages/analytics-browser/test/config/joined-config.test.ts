import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { BrowserConfig as IBrowserConfig, BrowserRemoteConfig } from '@amplitude/analytics-types';
import { BrowserJoinedConfigGenerator, createBrowserJoinedConfigGenerator } from '../../src/config/joined-config';
import { createConfigurationMock } from '../helpers/mock';
import { RequestMetadata } from '@amplitude/analytics-core';

jest.mock('@amplitude/analytics-remote-config', () => ({
  createRemoteConfigFetch: jest.fn(),
}));

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
