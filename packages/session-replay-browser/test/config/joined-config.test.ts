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
  maskAttributes: [],
  urlMaskLevels: [],
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

    describe('remote config subscription', () => {
      // SR-4234: subscribing in 'all' mode races a synchronous localStorage cache read
      // against the network fetch, and the cache always wins. This pins the fix —
      // subscribe must use a wait-for-remote delivery mode so the SDK prefers the live
      // config and only falls back to cache after the budget elapses.
      test('subscribes with { timeout } delivery mode (not "all")', async () => {
        await joinedConfigGenerator.generateJoinedConfig();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockRemoteConfigClient.subscribe).toHaveBeenCalledWith(
          'configs.sessionReplay',
          expect.objectContaining({ timeout: expect.any(Number) }),
          expect.any(Function),
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const deliveryMode = mockRemoteConfigClient.subscribe.mock.calls[0][1];
        expect(deliveryMode).not.toBe('all');
        expect(deliveryMode.timeout).toBeGreaterThan(0);
      });
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
      test('should use min_session_duration_ms from API', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { ...samplingConfig, min_session_duration_ms: 3000 },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config.minSessionDurationMs).toBe(3000);
      });
      test('should clamp min_session_duration_ms above ceiling and warn', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { ...samplingConfig, min_session_duration_ms: 30_000_000 },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config.minSessionDurationMs).toBe(60_000);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLocalConfig.loggerProvider.warn).toHaveBeenCalledWith(
          expect.stringContaining('exceeds 60000ms ceiling; clamping'),
        );
      });
      test('should drop negative min_session_duration_ms and warn', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { ...samplingConfig, min_session_duration_ms: -100 },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config.minSessionDurationMs).toBeUndefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLocalConfig.loggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('is negative'));
      });
      test('should drop non-finite min_session_duration_ms and warn', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { ...samplingConfig, min_session_duration_ms: 'not-a-number' as unknown as number },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config.minSessionDurationMs).toBeUndefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLocalConfig.loggerProvider.warn).toHaveBeenCalledWith(
          expect.stringContaining('not a finite number'),
        );
      });
      test('should drop NaN min_session_duration_ms and warn', async () => {
        mockRemoteConfig = {
          sr_sampling_config: { ...samplingConfig, min_session_duration_ms: NaN },
        };
        const { joinedConfig: config } = await joinedConfigGenerator.generateJoinedConfig();
        expect(config.minSessionDurationMs).toBeUndefined();
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
            unmaskSelector: ['.amp-unmask'],
            blockSelector: ['.className', '.anotherClassName'],
          },
        });
      });

      test.each(['block', 'mask'])('should join %p selector from API', async (selectorType) => {
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
              unmaskSelector: ['.amp-unmask'],
              maskAttributes: [],
              urlMaskLevels: [],
            },
            ...{ [`${selectorType}Selector`]: ['.localClassName', '.remoteClassName'] },
          },
        });
      });

      test('should join "unmask" selector from API', async () => {
        const config = await privacySelectorTest(
          { unmaskSelector: ['.remoteClassName'] },
          await createSessionReplayJoinedConfigGenerator('static_key', {
            ...mockOptions,
            privacyConfig: { unmaskSelector: ['.localClassName'] },
          }),
        );
        expect(config).toEqual({
          ...mockLocalConfig,
          captureEnabled: true,
          optOut: mockLocalConfig.optOut,
          loggingConfig: undefined,
          interactionConfig: undefined,
          privacyConfig: {
            defaultMaskLevel: 'medium',
            blockSelector: undefined,
            maskSelector: undefined,
            unmaskSelector: ['.amp-unmask', '.localClassName', '.remoteClassName'],
            maskAttributes: [],
            urlMaskLevels: [],
          },
        });
      });

      test('should dedupe .amp-unmask when user explicitly passes it alongside the auto-injected default', async () => {
        const config = await privacySelectorTest(
          { unmaskSelector: ['.remoteClassName'] },
          await createSessionReplayJoinedConfigGenerator('static_key', {
            ...mockOptions,
            privacyConfig: { unmaskSelector: ['.amp-unmask', '.localClassName'] },
          }),
        );
        expect(config.privacyConfig?.unmaskSelector).toEqual(['.amp-unmask', '.localClassName', '.remoteClassName']);
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
            unmaskSelector: ['.amp-unmask'],
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
            unmaskSelector: ['.amp-unmask'],
            maskAttributes: [],
            urlMaskLevels: [],
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
            unmaskSelector: ['.amp-unmask'],
          },
        });
      });

      describe('with maskAttributes config', () => {
        test('should merge local and remote maskAttributes', async () => {
          const config = await privacySelectorTest(
            { maskAttributes: ['aria-label'] },
            await createSessionReplayJoinedConfigGenerator('static_key', {
              ...mockOptions,
              privacyConfig: { maskAttributes: ['placeholder'] },
            }),
          );
          expect(config.privacyConfig?.maskAttributes).toEqual(['placeholder', 'aria-label']);
        });

        test('should deduplicate maskAttributes present in both local and remote', async () => {
          const config = await privacySelectorTest(
            { maskAttributes: ['placeholder', 'aria-label'] },
            await createSessionReplayJoinedConfigGenerator('static_key', {
              ...mockOptions,
              privacyConfig: { maskAttributes: ['placeholder'] },
            }),
          );
          expect(config.privacyConfig?.maskAttributes).toEqual(['placeholder', 'aria-label']);
        });

        test('should use only local maskAttributes when remote has none', async () => {
          const config = await privacySelectorTest(
            {},
            await createSessionReplayJoinedConfigGenerator('static_key', {
              ...mockOptions,
              privacyConfig: { maskAttributes: ['placeholder'] },
            }),
          );
          expect(config.privacyConfig?.maskAttributes).toEqual(['placeholder']);
        });

        test('should use only remote maskAttributes when local has none', async () => {
          const config = await privacySelectorTest({ maskAttributes: ['aria-label'] });
          expect(config.privacyConfig?.maskAttributes).toEqual(['aria-label']);
        });

        test('should produce empty maskAttributes when neither local nor remote has any', async () => {
          const config = await privacySelectorTest({});
          expect(config.privacyConfig?.maskAttributes).toEqual([]);
        });
      });

      describe('with urlMaskLevels config', () => {
        const remoteRule = { match: 'https://example.com/admin/*', maskLevel: 'conservative' as const };
        const localRule = { match: 'https://example.com/public/*', maskLevel: 'light' as const };

        test('should prepend remote urlMaskLevels before local (remote has priority)', async () => {
          const config = await privacySelectorTest(
            { urlMaskLevels: [remoteRule] },
            await createSessionReplayJoinedConfigGenerator('static_key', {
              ...mockOptions,
              privacyConfig: { urlMaskLevels: [localRule] },
            }),
          );
          expect(config.privacyConfig?.urlMaskLevels).toEqual([remoteRule, localRule]);
        });

        test('should use only local urlMaskLevels when remote has none', async () => {
          const config = await privacySelectorTest(
            {},
            await createSessionReplayJoinedConfigGenerator('static_key', {
              ...mockOptions,
              privacyConfig: { urlMaskLevels: [localRule] },
            }),
          );
          expect(config.privacyConfig?.urlMaskLevels).toEqual([localRule]);
        });

        test('should use only remote urlMaskLevels when local has none', async () => {
          const config = await privacySelectorTest({ urlMaskLevels: [remoteRule] });
          expect(config.privacyConfig?.urlMaskLevels).toEqual([remoteRule]);
        });

        test('should produce empty urlMaskLevels when neither local nor remote has any', async () => {
          const config = await privacySelectorTest({});
          expect(config.privacyConfig?.urlMaskLevels).toEqual([]);
        });

        test('remote defaultMaskLevel wins over local defaultMaskLevel', async () => {
          // P1: remote config must override local when both specify defaultMaskLevel.
          // Local says 'conservative'; remote says 'light' — joined config must reflect 'light'.
          const config = await privacySelectorTest(
            { defaultMaskLevel: 'light' },
            await createSessionReplayJoinedConfigGenerator('static_key', {
              ...mockOptions,
              privacyConfig: { defaultMaskLevel: 'conservative' },
            }),
          );
          expect(config.privacyConfig?.defaultMaskLevel).toBe('light');
        });

        test('local urlMaskLevels are preserved when sr_privacy_config is absent from remote', async () => {
          // P1: when the remote response has no sr_privacy_config key at all, the joined config
          // should fall back to the local config as-is — local urlMaskLevels must not be lost.
          const localRule = { match: 'https://example.com/admin/*', maskLevel: 'conservative' as const };
          mockRemoteConfig = {
            sr_sampling_config: samplingConfig,
            // intentionally no sr_privacy_config key
          };
          const configGenerator = await createSessionReplayJoinedConfigGenerator('static_key', {
            ...mockOptions,
            privacyConfig: { urlMaskLevels: [localRule] },
          });
          const { joinedConfig: config } = await configGenerator.generateJoinedConfig();
          expect(config.privacyConfig?.urlMaskLevels).toEqual([localRule]);
        });
      });
    });

    describe('SessionReplayLocalConfig privacyConfig', () => {
      test('should include .amp-unmask in unmaskSelector when no privacyConfig is provided', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          privacyConfig: undefined,
        });
        expect(config.privacyConfig?.unmaskSelector).toEqual(['.amp-unmask']);
      });

      test('should include .amp-unmask in unmaskSelector when privacyConfig has no unmaskSelector', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          privacyConfig: { blockSelector: '.block-me' },
        });
        expect(config.privacyConfig?.unmaskSelector).toEqual(['.amp-unmask']);
      });

      test('should prepend .amp-unmask before user-provided unmaskSelector entries', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          privacyConfig: { unmaskSelector: ['.custom-unmask', '#my-id'] },
        });
        expect(config.privacyConfig?.unmaskSelector).toEqual(['.amp-unmask', '.custom-unmask', '#my-id']);
      });

      test('should dedupe .amp-unmask when user explicitly includes it in unmaskSelector', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          privacyConfig: { unmaskSelector: ['.amp-unmask', '.foo'] },
        });
        expect(config.privacyConfig?.unmaskSelector).toEqual(['.amp-unmask', '.foo']);
      });

      test('should preserve other privacyConfig properties alongside the injected unmaskSelector', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          privacyConfig: {
            blockSelector: '.block-me',
            maskSelector: ['.mask-me'],
            defaultMaskLevel: 'conservative',
          },
        });
        expect(config.privacyConfig).toEqual({
          blockSelector: '.block-me',
          maskSelector: ['.mask-me'],
          defaultMaskLevel: 'conservative',
          unmaskSelector: ['.amp-unmask'],
        });
      });

      test('should always set privacyConfig (never undefined)', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          privacyConfig: undefined,
        });
        expect(config.privacyConfig).toBeDefined();
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

      test('should default captureAdoptedStyleSheets to true when not provided', () => {
        const config = new SessionReplayLocalConfig('static_key', mockOptions);
        expect(config.captureAdoptedStyleSheets).toBe(true);
      });

      test('should set captureAdoptedStyleSheets to true when provided', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          captureAdoptedStyleSheets: true,
        });
        expect(config.captureAdoptedStyleSheets).toBe(true);
      });

      test('should set captureAdoptedStyleSheets to false when provided', () => {
        const config = new SessionReplayLocalConfig('static_key', {
          ...mockOptions,
          captureAdoptedStyleSheets: false,
        });
        expect(config.captureAdoptedStyleSheets).toBe(false);
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

  describe('diagnostics', () => {
    const makeDiagnosticsClient = () => ({
      setTag: jest.fn(),
      increment: jest.fn(),
      recordHistogram: jest.fn(),
      recordEvent: jest.fn(),
      _flush: jest.fn(),
      _setSampleRate: jest.fn(),
    });

    const makeGeneratorWithDiagnostics = (diagnosticsClient: ReturnType<typeof makeDiagnosticsClient>) => {
      const localConfig = new SessionReplayLocalConfig('static_key', mockOptions);
      (localConfig as { diagnosticsClient?: unknown }).diagnosticsClient = diagnosticsClient;
      return new SessionReplayJoinedConfigGenerator(mockRemoteConfigClient, localConfig, {
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    };

    test('records config.received event and source/has_targeting counters when targeting present', async () => {
      const diagnosticsClient = makeDiagnosticsClient();
      mockRemoteConfig = {
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_targeting_config: {
          key: 'sr_targeting_config',
          variants: { on: { key: 'on' }, off: { key: 'off' } },
          segments: [{}, {}],
        },
      } as unknown as RemoteConfig;
      const generator = makeGeneratorWithDiagnostics(diagnosticsClient);
      await generator.generateJoinedConfig();

      expect(diagnosticsClient.increment).toHaveBeenCalledWith('sr.trc.config.source.cache');
      expect(diagnosticsClient.increment).toHaveBeenCalledWith('sr.trc.config.has_targeting');
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.config.received',
        expect.objectContaining({
          sessionId: 123,
          deviceId: '1a2b3c',
          srId: '1a2b3c/123',
          source: 'cache',
          hasSampling: true,
          hasTargeting: true,
          targetingSegmentCount: 2,
        }),
      );
    });

    test('records no_targeting counter when targeting absent', async () => {
      const diagnosticsClient = makeDiagnosticsClient();
      mockRemoteConfig = {
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
      };
      const generator = makeGeneratorWithDiagnostics(diagnosticsClient);
      await generator.generateJoinedConfig();

      expect(diagnosticsClient.increment).toHaveBeenCalledWith('sr.trc.config.no_targeting');
      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.config.received',
        expect.objectContaining({ hasTargeting: false, targetingSegmentCount: undefined }),
      );
    });

    test('records config.received with undefined sampling fields when sampling config absent', async () => {
      const diagnosticsClient = makeDiagnosticsClient();
      mockRemoteConfig = {
        // No sr_sampling_config -> samplingForLog is undefined, exercising the optional-chain branch.
        sr_privacy_config: { blockSelector: ['.foo'] },
      };
      const generator = makeGeneratorWithDiagnostics(diagnosticsClient);
      await generator.generateJoinedConfig();

      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sr.trc.config.received',
        expect.objectContaining({
          hasSampling: false,
          captureEnabled: undefined,
          sampleRate: undefined,
          hasPrivacy: true,
        }),
      );
    });

    test('increments config.fetch_failed when remote config fetch fails', async () => {
      const diagnosticsClient = makeDiagnosticsClient();
      mockRemoteConfig = null;
      const generator = makeGeneratorWithDiagnostics(diagnosticsClient);
      const { joinedConfig } = await generator.generateJoinedConfig();

      expect(diagnosticsClient.increment).toHaveBeenCalledWith('sr.trc.config.fetch_failed');
      expect(joinedConfig.captureEnabled).toBe(false);
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

  describe('generateJoinedConfig with undefined privacyConfig on joined config', () => {
    test('should fall back to empty object when config.privacyConfig is undefined', async () => {
      // Directly instantiate with a local config that has privacyConfig stripped,
      // exercising the `config.privacyConfig ?? {}` branch in joined-config.ts.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const generator = new SessionReplayJoinedConfigGenerator(mockRemoteConfigClient, {
        ...mockLocalConfig,
        privacyConfig: undefined,
      } as any);
      mockRemoteConfig = { sr_privacy_config: { blockSelector: ['.remote-block'] } };
      const { joinedConfig } = await generator.generateJoinedConfig();
      expect(joinedConfig.privacyConfig?.blockSelector).toEqual(['.remote-block']);
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
