import { LogLevel } from '@amplitude/analytics-types';
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
      instanceName: '$default_instance',
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
      savedMaxCount: 1000,
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
      instanceName: '$default_instance',
      logLevel: LogLevel.Verbose,
      loggerProvider: new Logger(),
      minIdLength: undefined,
      _optOut: true,
      plan: {
        version: '0',
      },
      savedMaxCount: 1000,
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
      expect(getServerUrl('EU', true)).toBe(EU_AMPLITUDE_BATCH_SERVER_URL);
    });
    test('should return eu http url', () => {
      expect(getServerUrl('EU', false)).toBe(EU_AMPLITUDE_SERVER_URL);
    });
    test('should return us batch url', () => {
      expect(getServerUrl('US', true)).toBe(AMPLITUDE_BATCH_SERVER_URL);
    });
    test('should return us http url', () => {
      expect(getServerUrl('US', false)).toBe(AMPLITUDE_SERVER_URL);
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
        serverZone: 'US',
        serverUrl: AMPLITUDE_SERVER_URL,
      });
    });
  });

  test('should not overwrite flushIntervalMillis=0 with default value', () => {
    const defaultConfig = useDefaultConfig();
    const config = new Config({
      apiKey: API_KEY,
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      flushIntervalMillis: 0,
    });
    expect(config.flushIntervalMillis).toEqual(0);
  });
});
