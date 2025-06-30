/* eslint-disable @typescript-eslint/no-unsafe-call */
import { LogLevel, ILogger, ServerZone } from '@amplitude/analytics-core';
import { SessionReplayOptions } from 'src/typings/session-replay';
import {
  SessionReplayJoinedConfigGenerator,
  createSessionReplayJoinedConfigGenerator,
  removeInvalidSelectorsFromPrivacyConfig,
} from '../../src/config/joined-config';
import { SessionReplayLocalConfig } from '../../src/config/local-config';
import { PrivacyConfig, SessionReplayRemoteConfig, UGCFilterRule } from '../../src/config/types';

jest.mock('@amplitude/analytics-remote-config');

// Accessing mock helper functions from the Jest manual mock for @amplitude/analytics-remote-config.
// This import is intentionally ts-ignored as these helpers are not part of the module's type definitions.
import {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  __setNamespaceConfig,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  __setShouldThrowError,
  createRemoteConfigFetch,
} from '@amplitude/analytics-remote-config';

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
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();

    jest.useRealTimers();
  });

  describe('generateJoinedConfig', () => {
    let joinedConfigGenerator: SessionReplayJoinedConfigGenerator;
    beforeEach(async () => {
      // Reset the namespace config before each test
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
      });
      __setShouldThrowError(false);
      jest.spyOn(document, 'createDocumentFragment').mockReturnValue({
        querySelector: () => true,
      } as unknown as DocumentFragment);
      joinedConfigGenerator = await createSessionReplayJoinedConfigGenerator('static_key', mockOptions);
    });

    describe('with successful sampling config fetch', () => {
      test('should use sample_rate and capture_enabled from API', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
        });
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: samplingConfig.capture_enabled,
        });
      });
      test('should use sample_rate only from API', async () => {
        __setNamespaceConfig({
          sr_sampling_config: { sample_rate: samplingConfig.sample_rate },
        });
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: false,
        });
      });
      test('should use capture_enabled only from API', async () => {
        __setNamespaceConfig({
          sr_sampling_config: { capture_enabled: false },
        });
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: false,
        });
      });
      test('should set captureEnabled to true if no values returned from API', async () => {
        __setNamespaceConfig({
          sr_sampling_config: {},
        });
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: true,
        });
      });
    });
    describe('with unsuccessful sampling config fetch', () => {
      test('should set captureEnabled to true', async () => {
        __setShouldThrowError(true);
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: false,
        });
      });
    });
    describe('with successful privacy config fetch', () => {
      const privacySelectorTest = async (
        remotePrivacyConfig?: PrivacyConfig,
        configGenerator: SessionReplayJoinedConfigGenerator = joinedConfigGenerator,
      ) => {
        __setNamespaceConfig({
          sr_privacy_config: remotePrivacyConfig,
        });
        const remoteConfigFetch = await createRemoteConfigFetch<SessionReplayRemoteConfig>({
          localConfig: mockLocalConfig,
          configKeys: ['sessionReplay'],
        });
        new SessionReplayJoinedConfigGenerator(remoteConfigFetch, mockLocalConfig);
        const { joinedConfig } = await configGenerator.generateJoinedConfig(123);
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
        const localConfig = new SessionReplayLocalConfig('static_key', { ...mockOptions, privacyConfig: undefined });
        const mockRemoteConfigFetch = await createRemoteConfigFetch<SessionReplayRemoteConfig>({
          localConfig,
          configKeys: ['sessionReplay'],
        });
        __setNamespaceConfig({
          sr_privacy_config: privacyConfig,
        });
        const configGenerator = new SessionReplayJoinedConfigGenerator(mockRemoteConfigFetch, localConfig);
        const { joinedConfig: config } = await configGenerator.generateJoinedConfig(123);
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

        const configGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
          ...mockOptions,
          interactionConfig: {
            enabled: true,
            batch: false,
            ugcFilterRules: localUgcFilterRules,
          },
        });

        __setNamespaceConfig({
          sr_interaction_config: remoteInteractionConfig,
        });

        const { joinedConfig: config } = await configGenerator.generateJoinedConfig(123);
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

        __setNamespaceConfig({
          sr_interaction_config: remoteInteractionConfig,
        });

        const { joinedConfig: config } = await configGenerator.generateJoinedConfig(123);
        expect(config.interactionConfig).toEqual(remoteInteractionConfig);
      });

      test('should handle undefined interaction config', async () => {
        __setNamespaceConfig({
          sr_interaction_config: undefined,
        });
        const { joinedConfig: config } = await configGenerator.generateJoinedConfig(123);
        expect(config.interactionConfig).toBeUndefined();
      });

      test('should handle empty ugcFilterRules array', async () => {
        const localUgcFilterRules: UGCFilterRule[] = [];
        const remoteInteractionConfig = {
          enabled: true,
          batch: true,
        };

        const configGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
          ...mockOptions,
          interactionConfig: {
            enabled: true,
            batch: false,
            ugcFilterRules: localUgcFilterRules,
          },
        });

        __setNamespaceConfig({
          sr_interaction_config: remoteInteractionConfig,
        });

        const { joinedConfig: config } = await configGenerator.generateJoinedConfig(123);
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
});
