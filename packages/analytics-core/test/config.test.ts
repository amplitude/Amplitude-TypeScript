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
      appVersion: undefined,
      deviceId: undefined,
      flushIntervalMillis: 1000,
      flushMaxRetries: 5,
      flushQueueSize: 10,
      logLevel: LogLevel.Warn,
      loggerProvider: new Logger(),
      optOut: false,
      partnerId: undefined,
      plugins: [],
      saveEvents: true,
      serverUrl: 'https://api2.amplitude.com/2/httpapi',
      serverZone: 'US',
      sessionId: undefined,
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      useBatch: false,
      userId: undefined,
    });
  });

  test('should overwrite default config', () => {
    const defaultConfig = useDefaultConfig();
    const config = new Config({
      apiKey: API_KEY,
      logLevel: LogLevel.Verbose,
      optOut: true,
      saveEvents: false,
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      useBatch: true,
    });
    expect(config).toEqual({
      apiKey: 'apiKey',
      appVersion: undefined,
      deviceId: undefined,
      flushIntervalMillis: 1000,
      flushMaxRetries: 5,
      flushQueueSize: 10,
      logLevel: LogLevel.Verbose,
      loggerProvider: new Logger(),
      optOut: true,
      partnerId: undefined,
      plugins: [],
      saveEvents: false,
      serverUrl: 'https://api2.amplitude.com/batch',
      serverZone: 'US',
      sessionId: undefined,
      storageProvider: defaultConfig.storageProvider,
      transportProvider: defaultConfig.transportProvider,
      useBatch: true,
      userId: undefined,
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
    test('should return default', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore to test invalid values
      expect(createServerConfig('', undefined)).toEqual({
        serverZone: ServerZone.US,
        serverUrl: AMPLITUDE_SERVER_URL,
      });
    });
  });
});
