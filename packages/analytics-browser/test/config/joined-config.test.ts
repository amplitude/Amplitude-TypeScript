import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { BrowserConfig as IBrowserConfig } from '@amplitude/analytics-types';
import { BrowserJoinedConfigGenerator, createBrowserJoinedConfigGenerator } from '../../src/config/joined-config';
import { createConfigurationMock } from '../helpers/mock';
import { BrowserRemoteConfig } from '../../lib/scripts/config/types';

jest.mock('@amplitude/analytics-remote-config', () => ({
  createRemoteConfigFetch: jest.fn(),
}));

describe('joined-config', () => {
  let localConfig: IBrowserConfig;
  let mockRemoteConfigFetch: RemoteConfigFetch<BrowserRemoteConfig>;
  let generator: BrowserJoinedConfigGenerator;

  beforeEach(() => {
    localConfig = { ...createConfigurationMock(), defaultTracking: false };

    mockRemoteConfigFetch = {
      getRemoteConfig: jest.fn().mockResolvedValue({
        defaultTracking: true,
      }),
      // TODO(xinyi): uncomment this line when fetchTime is used in the joined config
      // fetchTime: 23,
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
