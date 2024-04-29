import { LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import { SessionReplayOptions } from 'src/typings/session-replay';
import { SessionReplayJoinedConfigGenerator } from '../../src/config/joined-config';
import { SessionReplayLocalConfig } from '../../src/config/local-config';
import { SessionReplaySessionIDBStore } from '../../src/session-idb-store';

type MockedLogger = jest.Mocked<Logger>;
const samplingConfig = {
  sample_rate: 0.4,
  capture_enabled: true,
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
  privacyConfig: {
    blockSelector: '.className',
  },
};

const mockLocalConfig = new SessionReplayLocalConfig('static_key', mockOptions);

describe('SessionReplayJoinedConfigGenerator', () => {
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  let sessionIDBStore: SessionReplaySessionIDBStore;
  beforeEach(() => {
    sessionIDBStore = new SessionReplaySessionIDBStore({
      loggerProvider: mockLoggerProvider,
      apiKey: 'static_key',
    });
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();

    jest.useRealTimers();
  });

  describe('generateJoinedConfig', () => {
    let joinedConfigGenerator: SessionReplayJoinedConfigGenerator;
    let getSamplingConfigMock: jest.Mock;
    beforeEach(() => {
      joinedConfigGenerator = new SessionReplayJoinedConfigGenerator('static_key', mockOptions, sessionIDBStore);
    });

    describe('with successful samping config fetch', () => {
      test('should use sample_rate and capture_enabled from API', async () => {
        getSamplingConfigMock = jest.fn().mockResolvedValue(samplingConfig);
        joinedConfigGenerator.remoteConfigFetch.getSamplingConfig = getSamplingConfigMock;
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: samplingConfig.capture_enabled,
        });
      });
      test('should use sample_rate only from API', async () => {
        getSamplingConfigMock = jest.fn().mockResolvedValue({ sample_rate: samplingConfig.sample_rate });
        joinedConfigGenerator.remoteConfigFetch.getSamplingConfig = getSamplingConfigMock;
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: false,
        });
      });
      test('should use capture_enabled only from API', async () => {
        getSamplingConfigMock = jest.fn().mockResolvedValue({ capture_enabled: false });
        joinedConfigGenerator.remoteConfigFetch.getSamplingConfig = getSamplingConfigMock;
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: false,
        });
      });
      test('should set captureEnabled to true if no values returned from API', async () => {
        getSamplingConfigMock = jest.fn().mockResolvedValue({});
        joinedConfigGenerator.remoteConfigFetch.getSamplingConfig = getSamplingConfigMock;
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: true,
        });
      });
    });
    describe('with unsuccessful sampling config fetch', () => {
      test('should set captureEnabled to true', async () => {
        getSamplingConfigMock = jest.fn().mockRejectedValue({});
        joinedConfigGenerator.remoteConfigFetch.getSamplingConfig = getSamplingConfigMock;
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: true,
        });
      });
    });
  });
});
