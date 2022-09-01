import { LogLevel, ServerZone } from '@amplitude/analytics-types';
import {
  AMPLITUDE_BATCH_SERVER_URL,
  AMPLITUDE_SERVER_URL,
  EU_AMPLITUDE_BATCH_SERVER_URL,
  EU_AMPLITUDE_SERVER_URL,
} from '../src/constants';
import { Config, createServerConfig, getServerUrl } from '../src/config';
import { Logger } from '../src/logger';
import { API_KEY, useDefaultConfig } from './helpers/default';

describe('config', () => {
  test('should create default config', () => {
    const defaultConfig = useDefaultConfig();
    const config = new Config({
      apiKey: API_KEY,
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
    });
    expect(config).toEqual({
      apiKey: 'apiKey',
      flushIntervalMillis: 10000,
      flushMaxRetries: 12,
      flushQueueSize: 200,
      logLevel: LogLevel.Warn,
      loggerProvider: new Logger(),
      minIdLength: undefined,
      _optOut: false, // private for `optOut` getter/setter
      partnerId: undefined,
      plan: undefined,
      ingestionMetadata: undefined,
      serverUrl: 'https://api2.amplitude.com/2/httpapi',
      serverZone: 'US',
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      useBatch: false,
    });
    expect(config.optOut).toBe(false);
  });

  test('should overwrite default config', () => {
    const defaultConfig = useDefaultConfig();
    const config = new Config({
      apiKey: API_KEY,
      logLevel: LogLevel.Verbose,
      optOut: true,
      plan: { version: '0' },
      ingestionMetadata: {
        sourceName: 'ampli',
        sourceVersion: '2.0.0',
      },
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      useBatch: true,
    });
    expect(config).toEqual({
      apiKey: 'apiKey',
      flushIntervalMillis: 10000,
      flushMaxRetries: 12,
      flushQueueSize: 200,
      logLevel: LogLevel.Verbose,
      loggerProvider: new Logger(),
      minIdLength: undefined,
      _optOut: true,
      plan: {
        version: '0',
      },
      ingestionMetadata: {
        sourceName: 'ampli',
        sourceVersion: '2.0.0',
      },
      serverUrl: 'https://api2.amplitude.com/batch',
      serverZone: 'US',
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      useBatch: true,
    });
  });

  describe('getServerUrl', () => {
    test('should return eu batch url', () => {
      expect(getServerUrl(ServerZone.EU, true)).toBe(EU_AMPLITUDE_BATCH_SERVER_URL);
    });
    test('should return eu http url', () => {
      expect(getServerUrl(ServerZone.EU, false)).toBe(EU_AMPLITUDE_SERVER_URL);
    });
    test('should return us batch url', () => {
      expect(getServerUrl(ServerZone.US, true)).toBe(AMPLITUDE_BATCH_SERVER_URL);
    });
    test('should return us http url', () => {
      expect(getServerUrl(ServerZone.US, false)).toBe(AMPLITUDE_SERVER_URL);
    });
  });

  describe('createServerConfig', () => {
    test('should return custom server url', () => {
      expect(createServerConfig('https://domain.com')).toEqual({
        serverZone: undefined,
        serverUrl: 'https://domain.com',
      });
    });

    test('should return default', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to test invalid values
      expect(createServerConfig('', '', undefined)).toEqual({
        serverZone: ServerZone.US,
        serverUrl: AMPLITUDE_SERVER_URL,
      });
    });
  });
});
