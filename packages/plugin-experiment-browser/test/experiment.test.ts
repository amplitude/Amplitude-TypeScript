import { ExperimentPlugin, experimentPlugin, ExperimentPluginConfig } from '../src/experiment';
import { ExperimentClient, ExperimentConfig, initializeWithAmplitudeAnalytics } from '@amplitude/experiment-js-client';
import { BrowserClient, BrowserConfig, ILogger, LogLevel } from '@amplitude/analytics-core';

type MockedLogger = jest.Mocked<ILogger>;
type MockedBrowserClient = jest.Mocked<BrowserClient>;
type MockedExperimentClient = jest.Mock<ExperimentClient>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
jest.mock('@amplitude/experiment-js-client', () => ({
  ...jest.requireActual('@amplitude/experiment-js-client'),
  initializeWithAmplitudeAnalytics: jest.fn(),
}));

describe('ExperimentPlugin', () => {
  const mockLoggerProviderDebug = jest.fn();
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: mockLoggerProviderDebug,
  };
  const mockConfig: BrowserConfig = {
    apiKey: 'static_key',
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    optOut: false,
    deviceId: '1a2b3c',
    serverUrl: 'url',
    serverZone: 'US',
    useBatch: false,
    sessionId: 123,
    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieUpgrade: true,
    disableCookies: false,
    domain: '.amplitude.com',
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
  } as unknown as BrowserConfig;
  const mockAmplitude: MockedBrowserClient = {
    add: jest.fn(),
    remove: jest.fn(),
  } as unknown as MockedBrowserClient;

  beforeEach(() => {
    (initializeWithAmplitudeAnalytics as jest.Mock).mockReturnValue({} as unknown as MockedExperimentClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should set config', () => {
      const experimentConfig: ExperimentPluginConfig = {
        debug: true,
      };
      const plugin = new ExperimentPlugin(experimentConfig);
      expect(plugin.name).toEqual('@amplitude/experiment-analytics-plugin');
      expect(plugin.experiment).toBeUndefined();
      expect(plugin.config).toBe(experimentConfig);
    });
  });

  describe('setup', () => {
    test.each([
      {
        debug: true,
      },
      undefined,
    ])('should initialize experiment client with API key and set it on plugin', async (config) => {
      const experimentConfig: ExperimentPluginConfig | undefined = config;
      const mockExperimentClient = {} as unknown as ExperimentClient;
      (initializeWithAmplitudeAnalytics as jest.Mock).mockReturnValue(mockExperimentClient);
      const plugin = new ExperimentPlugin(experimentConfig);
      await plugin.setup(mockConfig, mockAmplitude);
      expect(initializeWithAmplitudeAnalytics).toHaveBeenCalledWith(mockConfig.apiKey, experimentConfig);
      expect(plugin.experiment).toBe(mockExperimentClient);
    });

    test('should initialize experiment client with deployment key and set it on plugin', async () => {
      const experimentConfig: ExperimentPluginConfig = {
        debug: true,
        deploymentKey: 'test-deployment-key',
      };
      const mockExperimentClient = {} as unknown as ExperimentClient;
      (initializeWithAmplitudeAnalytics as jest.Mock).mockReturnValue(mockExperimentClient);
      const plugin = new ExperimentPlugin(experimentConfig);
      await plugin.setup(mockConfig, mockAmplitude);
      expect(initializeWithAmplitudeAnalytics).toHaveBeenCalledWith(experimentConfig.deploymentKey, experimentConfig);
      expect(plugin.experiment).toBe(mockExperimentClient);
    });
  });

  describe('experimentPlugin', () => {
    test('should return an instance of ExperimentPlugin with config', () => {
      const experimentConfig: ExperimentConfig = {
        debug: true,
      };
      const plugin = experimentPlugin(experimentConfig);
      expect(plugin).toBeInstanceOf(ExperimentPlugin);
      expect((plugin as ExperimentPlugin).config).toEqual(experimentConfig);
    });

    test('should return an instance of ExperimentPlugin without config', () => {
      const plugin = experimentPlugin();
      expect(plugin).toBeInstanceOf(ExperimentPlugin);
      expect((plugin as ExperimentPlugin).config).toBeUndefined();
    });
  });
});
