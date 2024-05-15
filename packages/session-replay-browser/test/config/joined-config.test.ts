import * as RemoteConfigFetch from '@amplitude/analytics-remote-config';
import { LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import { SessionReplayOptions } from 'src/typings/session-replay';
import { SessionReplayJoinedConfigGenerator } from '../../src/config/joined-config';
import { SessionReplayLocalConfig } from '../../src/config/local-config';

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
  let getRemoteConfigMock: jest.Mock;
  beforeEach(() => {
    getRemoteConfigMock = jest.fn();
    jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
      getRemoteConfig: getRemoteConfigMock,
    });
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();

    jest.useRealTimers();
  });

  describe('generateJoinedConfig', () => {
    let joinedConfigGenerator: SessionReplayJoinedConfigGenerator;
    beforeEach(async () => {
      joinedConfigGenerator = new SessionReplayJoinedConfigGenerator('static_key', mockOptions);
      await joinedConfigGenerator.initialize();
    });

    describe('with successful samping config fetch', () => {
      test('should use sample_rate and capture_enabled from API', async () => {
        getRemoteConfigMock.mockResolvedValue(samplingConfig);
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: samplingConfig.capture_enabled,
        });
      });
      test('should use sample_rate only from API', async () => {
        getRemoteConfigMock.mockResolvedValue({ sample_rate: samplingConfig.sample_rate });
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          sampleRate: samplingConfig.sample_rate,
          captureEnabled: false,
        });
      });
      test('should use capture_enabled only from API', async () => {
        getRemoteConfigMock.mockResolvedValue({ capture_enabled: false });
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: false,
        });
      });
      test('should set captureEnabled to true if no values returned from API', async () => {
        getRemoteConfigMock.mockResolvedValue({});
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
        getRemoteConfigMock.mockRejectedValue({});
        const config = await joinedConfigGenerator.generateJoinedConfig(123);
        expect(config).toEqual({
          ...mockLocalConfig,
          optOut: mockLocalConfig.optOut,
          captureEnabled: true,
        });
      });
    });
    describe('without first initializing', () => {
      test('should set captureEnabled to true', async () => {
        joinedConfigGenerator = new SessionReplayJoinedConfigGenerator('static_key', mockOptions);
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
