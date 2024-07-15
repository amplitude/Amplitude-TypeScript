import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { BrowserConfig as IBrowserConfig } from '@amplitude/analytics-types';
import { BrowserJoinedConfigGenerator, createBrowserJoinedConfigGenerator } from '../../src/config/joined-config';
import { createConfigurationMock } from '../helpers/mock';
import { BrowserRemoteConfig } from '../../src/config/types';
import { RequestMetadata } from '@amplitude/analytics-core';

jest.mock('@amplitude/analytics-remote-config', () => ({
  createRemoteConfigFetch: jest.fn(),
}));

describe('joined-config', () => {
  let localConfig: IBrowserConfig;
  let mockRemoteConfigFetch: RemoteConfigFetch<BrowserRemoteConfig>;
  let generator: BrowserJoinedConfigGenerator;
  const fetchTime = 100;

  beforeEach(() => {
    localConfig = { ...createConfigurationMock(), defaultTracking: false, autocapture: false };

    mockRemoteConfigFetch = {
      getRemoteConfig: jest.fn().mockResolvedValue({
        defaultTracking: true,
        autocapture: true,
      }),
      fetchTime: fetchTime,
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
      test('should disable autocapture if remote config sets it to false', async () => {
        localConfig = createConfigurationMock();
        mockRemoteConfigFetch = {
          getRemoteConfig: jest.fn().mockResolvedValue({
            defaultTracking: false,
            autocapture: false,
          }),
          fetchTime: fetchTime,
        };
        // Mock the createRemoteConfigFetch to return the mockRemoteConfigFetch
        (createRemoteConfigFetch as jest.MockedFunction<typeof createRemoteConfigFetch>).mockResolvedValue(
          mockRemoteConfigFetch,
        );

        await generator.initialize();
        expect(generator.config.autocapture).toBe(false);
        const joinedConfig = await generator.generateJoinedConfig();
        expect(joinedConfig.autocapture).toBe(false);
      });

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
        expect(joinedConfig.requestMetadata?.sdk.metrics.histogram.remote_config_fetch_time).toBe(fetchTime);
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
