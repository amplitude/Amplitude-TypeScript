/* eslint-disable @typescript-eslint/no-unsafe-call */
import { LogLevel, ILogger, ServerZone, RemoteConfig, Source } from '@amplitude/analytics-core';
import * as core from '@amplitude/analytics-core';
import { SessionReplayOptions } from 'src/typings/session-replay';
import {
  SessionReplayJoinedConfigGenerator,
  createSessionReplayJoinedConfigGenerator,
  removeInvalidSelectorsFromPrivacyConfig,
} from '../../src/config/joined-config';
import { SessionReplayLocalConfig } from '../../src/config/local-config';
import { PrivacyConfig, UGCFilterRule } from '../../src/config/types';
import { DEFAULT_URL_CHANGE_POLLING_INTERVAL } from '../../src/constants';

// Mock remote config storage
let mockRemoteConfig: RemoteConfig | null = null;

// Mock RemoteConfigClient - will be recreated for each test
let mockRemoteConfigClient: any;

let MockedRemoteConfigClient: jest.SpyInstance;
let originalRemoteConfigClient: typeof core.RemoteConfigClient;

type MockedLogger = jest.Mocked<ILogger>;
const samplingConfig = {
  sample_rate: 0.4,
  capture_enabled: true,
};
const privacyConfig: Required<PrivacyConfig> = {
  defaultMaskLevel: 'medium',
  blockSelector: ['.anotherClassName'],
  maskSelector: [],
  unmaskSelector: [],
};

const mockLoggerProvider: MockedLogger = {
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockOptions: SessionReplayOptions = {
  flushIntervalMillis: 0,
  flushMaxRetries: 1,
  flushQueueSize: 0,
  logLevel: LogLevel.None,
  loggerProvider: mockLoggerProvider,
  deviceId: '1a2b3c',
  optOut: false,
  sampleRate: 1,
  sessionId: 123,
  serverZone: ServerZone.EU,
  privacyConfig: {},
};

const mockLocalConfig = new SessionReplayLocalConfig('static_key', mockOptions);

describe('SessionReplayJoinedConfigGenerator', () => {
  beforeEach(() => {
    mockRemoteConfig = {
      sr_sampling_config: samplingConfig,
      sr_privacy_config: {},
    };

    // Create a fresh mock client for each test
    mockRemoteConfigClient = {
      subscribe: jest
        .fn()
        .mockImplementation(
          (
            _configKey: string | undefined,
            _deliveryMode: any,
            callback: (remoteConfig: RemoteConfig | null, source: Source, lastFetch: Date) => void,
          ) => {
            // Call the callback synchronously with the mock remote config
            callback(mockRemoteConfig, 'cache', new Date());
            return 'mock-subscription-id';
          },
        ),
      unsubscribe: jest.fn(() => true),
      updateConfigs: jest.fn(),
    };

    // Set up RemoteConfigClient mock
    originalRemoteConfigClient = core.RemoteConfigClient;
    //
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    MockedRemoteConfigClient = jest.fn().mockImplementation(() => mockRemoteConfigClient);
    Object.defineProperty(core, 'RemoteConfigClient', {
      value: MockedRemoteConfigClient,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();

    // Clean up RemoteConfigClient mock
    if (MockedRemoteConfigClient) {
      Object.defineProperty(core, 'RemoteConfigClient', {
        value: originalRemoteConfigClient,
        writable: true,
        configurable: true,
      });
    }
  });

  describe('generateJoinedConfig', () => {
    let joinedConfigGenerator: SessionReplayJoinedConfigGenerator;
    beforeEach(async () => {
      jest.spyOn(document, 'createDocumentFragment').mockReturnValue({
        querySelector: () => true,
      } as unknown as DocumentFragment);
      joinedConfigGenerator = await createSessionReplayJoinedConfigGenerator('static_key', mockOptions);
    });

    describe('with successful sampling config fetch', () => {
      test('should use sample_rate and capture_enabled from API', async () => {
        mockRemoteConfig = {
          sr_sampling_config: samplingConfig,
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: samplingConfig.capture_enabled,
        });
      });

      test.each([
        { 샘플링_설정: { 캡처_활성화: true } },
        { sr_foo: 'invalid' },
        { sr_foo: 1 },
        { sr_foo: false },
        { sr_foo: undefined },
        { sr_foo: null },
        { sr_foo: {} },
        { sr_foo: [] },
      ])('should ignore improper config keys', async (inputConfig) => {
        mockRemoteConfig = inputConfig as any;
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config).toStrictEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          interactionConfig: undefined,
          loggingConfig: undefined,
        });
      });

      test('should use sample_rate only from API', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { sample_rate: samplingConfig.sample_rate },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: false,
        });
      });
      test('should use capture_enabled only from API', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { capture_enabled: false },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: false,
        });
      });
      test('should set captureEnabled to true if no values returned from API', async () => {
        mockRemoteConfig = {
          sr_sampling_config: {} as any,
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: true,
        });
      });
    });

    describe('with unsuccessful sampling config fetch', () => {
      test('should log error when no remote config', async () => {
        mockRemoteConfig = null;
        jest.spyOn(mockLoggerProvider, 'error').mockImplementationOnce(() => {
          return;
        });
        await joinedConfigGenerator.generateJoinedConfig();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.error).toHaveBeenCalledWith(
          'Failed to generate joined config: ',
          expect.objectContaining({
            message: 'No remote config received',
          }),
        );
      });
      test('should set captureEnabled to false when no remote config', async () => {
        mockRemoteConfig = null;
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: false,
        });
      });
      test('should set return an undefined remote config', async () => {
        mockRemoteConfig = null;
        const { localConfig } = await joinedConfigGenerator.generateJoinedConfig();
        expect(localConfig).toEqual(mockLocalConfig);
      });
    });
    describe('with successful privacy config fetch', () => {
      const privacySelectorTest = async (
        remotePrivacyConfig?: PrivacyConfig,
        configGenerator: SessionReplayJoinedConfigGenerator = joinedConfigGenerator,
      ) => {
        mockRemoteConfig = {
          sr_privacy_config: remotePrivacyConfig,
        };
        const { joinedConfig } = await configGenerator.generateJoinedConfig();
        return joinedConfig;
      };

      test('should join string block selector from API', async () => {
        const config = await privacySelectorTest(
          privacyConfig,
          await createSessionReplayJoinedConfigGenerator('static_key', {
            ...mockOptions,
            privacyConfig: {
              blockSelector: '.className',
            },
          }),
        );
        expect(config).toEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          privacyConfig: {
            ...privacyConfig,
            maskSelector: undefined,
            unmaskSelector: undefined,
            blockSelector: ['.className', '.anotherClassName'],
          },
        });
      });

      test.each(['block', 'mask', 'unmask'])('should join %p selector from API', async (selectorType) => {
        const config = await privacySelectorTest(
          {
            [`${selectorType}Selector`]: ['.remoteClassName'],
          },
          await createSessionReplayJoinedConfigGenerator('static_key', {
            ...mockOptions,
            privacyConfig: {
              [`${selectorType}Selector`]: ['.localClassName'],
            },
          }),
        );
        expect(config).toEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          privacyConfig: {
            ...{
              defaultMaskLevel: 'medium',
              blockSelector: undefined,
              maskSelector: undefined,
              unmaskSelector: undefined,
            },
            ...{ [`${selectorType}Selector`]: ['.localClassName', '.remoteClassName'] },
          },
        });
      });

      test('should use default mask level from API', async () => {
        const config = await privacySelectorTest({
          ...privacyConfig,
          defaultMaskLevel: 'light',
        });
        expect(config).toStrictEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          loggingConfig: undefined,
          privacyConfig: {
            ...privacyConfig,
            defaultMaskLevel: 'light',
            maskSelector: undefined,
            unmaskSelector: undefined,
          },
          interactionConfig: undefined,
        });
      });

      test('should use block selector from local if no API response', async () => {
        const config = await privacySelectorTest(
          {},
          await createSessionReplayJoinedConfigGenerator('static_key', {
            ...mockOptions,
            privacyConfig: {
              blockSelector: '.className',
            },
          }),
        );
        expect(config).toEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          privacyConfig: {
            defaultMaskLevel: 'medium',
            blockSelector: ['.className'],
            maskSelector: undefined,
            unmaskSelector: undefined,
          },
        });
      });

      test('should update to remote config when local privacy config is undefined', async () => {
        mockRemoteConfig = {
          sr_privacy_config: privacyConfig,
        };
        const configGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
          ...mockOptions,
          privacyConfig: undefined,
        });
        const { joinedConfig: config } = await configGenerator.generateJoinedConfig();
        expect(config).toEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          privacyConfig: {
            ...privacyConfig,
            maskSelector: undefined,
            unmaskSelector: undefined,
          },
        });
      });
    });

    describe('with interaction config', () => {
      test('should validate UGC filter rules when provided', () => {
        const validRules = [
          { selector: 'https://example.com/user/*', replacement: 'https://example.com/user/user_id' },
          { selector: 'https://example.com/product/*', replacement: 'https://example.com/product/product_id' },
        ];
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          interactionConfig: {
            enabled: true,
            batch: false,
            ugcFilterRules: validRules,
          },
        });
        expect(config.interactionConfig?.ugcFilterRules).toEqual(validRules);
      });

      test('should set urlChangePollingInterval to default value when not provided', () => {
        const config = new SessionReplayLocalConfig('static_key', mockOptions);
        expect(config.urlChangePollingInterval).toBe(DEFAULT_URL_CHANGE_POLLING_INTERVAL);
      });

      test('should set urlChangePollingInterval to custom value when provided', () => {
        const customInterval = 2000;
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          urlChangePollingInterval: customInterval,
        });
        expect(config.urlChangePollingInterval).toBe(customInterval);
      });

      test('should set urlChangePollingInterval to 0 when explicitly set to 0', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          urlChangePollingInterval: 0,
        });
        expect(config.urlChangePollingInterval).toBe(0);
      });

      test('should throw error for invalid UGC filter rules with non-string selector', () => {
        const invalidRules = [{ selector: 123, replacement: 'replacement' }] as unknown as UGCFilterRule[];
        expect(() => {
          new SessionReplayLocalConfig('static_key', {
            ...mockOptions,
            interactionConfig: {
              enabled: true,
              batch: false,
              ugcFilterRules: invalidRules,
            },
          });
        }).toThrow('ugcFilterRules must be an array of objects with selector and replacement properties');
      });

      test('should throw error for invalid UGC filter rules with non-string replacement', () => {
        const invalidRules = [{ selector: 'pattern', replacement: 456 }] as unknown as UGCFilterRule[];
        expect(() => {
          new SessionReplayLocalConfig('static_key', {
            ...mockOptions,
            interactionConfig: {
              enabled: true,
              batch: false,
              ugcFilterRules: invalidRules,
            },
          });
        }).toThrow('ugcFilterRules must be an array of objects with selector and replacement properties');
      });

      test('should throw error for invalid UGC filter rules with invalid glob pattern', () => {
        const invalidRules = [{ selector: 'invalid[pattern', replacement: 'replacement' }];
        expect(() => {
          new SessionReplayLocalConfig('static_key', {
            ...mockOptions,
            interactionConfig: {
              enabled: true,
              batch: false,
              ugcFilterRules: invalidRules,
            },
          });
        }).toThrow('ugcFilterRules must be an array of objects with valid globs');
      });
    });

    describe('with interaction config ugcFilterRules', () => {
      let configGenerator: SessionReplayJoinedConfigGenerator;

      beforeEach(async () => {
        configGenerator = await createSessionReplayJoinedConfigGenerator('static_key', mockOptions);
      });

      test('should preserve local ugcFilterRules when remote config has no ugcFilterRules', async () => {
        const localUgcFilterRules = [
          { selector: 'https://example.com/local/*', replacement: 'https://example.com/local/local_id' },
        ];
        const remoteInteractionConfig = {
          enabled: true,
          batch: true,
        };

        const localConfigGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
          ...mockOptions,
          interactionConfig: {
            enabled: true,
            batch: false,
            ugcFilterRules: localUgcFilterRules,
          },
        });

        mockRemoteConfig = {
          sr_interaction_config: remoteInteractionConfig,
        };

        const { joinedConfig: config } = await localConfigGenerator.generateJoinedConfig();
        expect(config.interactionConfig).toEqual({
          ...remoteInteractionConfig,
          ugcFilterRules: localUgcFilterRules,
        });
      });

      test('should use remote ugcFilterRules when local config has no ugcFilterRules', async () => {
        const remoteUgcFilterRules = [
          { selector: 'https://example.com/remote/*', replacement: 'https://example.com/remote/remote_id' },
        ];
        const remoteInteractionConfig = {
          enabled: true,
          batch: true,
          ugcFilterRules: remoteUgcFilterRules,
        };

        mockRemoteConfig = {
          sr_interaction_config: remoteInteractionConfig,
        };

        const { joinedConfig: config } = await configGenerator.generateJoinedConfig();
        expect(config.interactionConfig).toEqual(remoteInteractionConfig);
      });

      test('should handle undefined interaction config', async () => {
        mockRemoteConfig = {
          sr_interaction_config: undefined,
        };
        const { joinedConfig: config } = await configGenerator.generateJoinedConfig();
        expect(config.interactionConfig).toBeUndefined();
      });

      test('should handle empty ugcFilterRules array', async () => {
        const localUgcFilterRules: UGCFilterRule[] = [];
        const remoteInteractionConfig = {
          enabled: true,
          batch: true,
        };

        const localConfigGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
          ...mockOptions,
          interactionConfig: {
            enabled: true,
            batch: false,
            ugcFilterRules: localUgcFilterRules,
          },
        });

        mockRemoteConfig = {
          sr_interaction_config: remoteInteractionConfig,
        };

        const { joinedConfig: config } = await localConfigGenerator.generateJoinedConfig();
        expect(config.interactionConfig).toEqual({
          ...remoteInteractionConfig,
          ugcFilterRules: localUgcFilterRules,
        });
      });
    });
  });

  describe('removeInvalidSelectorsFromPrivacyConfig', () => {
    test('should handle string block selector correctly', async () => {
      const privacyConfig = {
        blockSelector: 'FASE<:F>!@<?#>!#<',
      };
      const updatedPrivacyConfig = removeInvalidSelectorsFromPrivacyConfig(privacyConfig, mockLoggerProvider);
      expect(updatedPrivacyConfig).toStrictEqual({
        blockSelector: undefined,
        maskSelector: undefined,
        unmaskSelector: undefined,
      });
    });
  });

  describe('createSessionReplayJoinedConfigGenerator with config server url', () => {
    test('should create a SessionReplayJoinedConfigGenerator with the correct remote config client', async () => {
      const configServerUrl = 'https://config.amplitude.com';
      const joinedConfigGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
        ...mockOptions,
        configServerUrl,
      });

      // Verify RemoteConfigClient was called with the correct parameters
      expect(MockedRemoteConfigClient).toHaveBeenCalledWith(
        'static_key',
        mockLoggerProvider,
        ServerZone.EU,
        configServerUrl,
      );

      // Verify the generator was created successfully
      expect(joinedConfigGenerator).toBeInstanceOf(SessionReplayJoinedConfigGenerator);
    });

    test('should pass undefined configServerUrl when not provided', async () => {
      await createSessionReplayJoinedConfigGenerator('static_key', mockOptions);

      // Verify RemoteConfigClient was called with undefined for configServerUrl
      expect(MockedRemoteConfigClient).toHaveBeenCalledWith('static_key', mockLoggerProvider, ServerZone.EU, undefined);
    });
  });
});
