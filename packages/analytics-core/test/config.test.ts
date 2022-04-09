import { getConfig, createConfig, resetInstances, Config, getApiHost } from '../src/config';
import { useDefaultConfig } from './helpers/default';
import {
  AMPLITUDE_SERVER_URL,
  AMPLITUDE_BATCH_SERVER_URL,
  EU_AMPLITUDE_SERVER_URL,
  EU_AMPLITUDE_BATCH_SERVER_URL,
} from '../src/constants';
import { ServerZone } from '@amplitude/analytics-types';

describe('config', () => {
  afterEach(() => {
    resetInstances();
  });

  test('should create new config and keep existing reference', () => {
    expect(getConfig()).toBeUndefined();
    const first = createConfig(useDefaultConfig());
    const second = createConfig(useDefaultConfig());
    expect(first).toBe(second);
    expect(getConfig()).toBeDefined();
  });

  test('should create default config', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
      }),
    );
    expect(getConfig()).toBeDefined();
  });

  test('should overwrite config', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        useBatch: true,
        logLevel: 0,
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getConfig().useBatch).toBe(true);
    expect(getConfig().logLevel).toBe(0);
  });

  test('should return serverUrl if the value exists', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        serverUrl: 'url',
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getApiHost(getConfig())).toBe('url');
  });

  test('should return US server url if serverUrl does not exist', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        serverUrl: undefined,
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getApiHost(getConfig())).toBe(AMPLITUDE_SERVER_URL);
  });

  test('should return US server url if serverUrl does not exist and serverZone is not valid', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        serverUrl: undefined,
        serverZone: <ServerZone>'invalid server zone',
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getApiHost(getConfig())).toBe(AMPLITUDE_SERVER_URL);
  });

  test('should return batch server url if serverUrl does not exist and useBatch is set', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        useBatch: true,
        serverUrl: undefined,
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getConfig().useBatch).toBe(true);
    expect(getApiHost(getConfig())).toBe(AMPLITUDE_BATCH_SERVER_URL);
  });

  test('should return EU server url if serverUrl does not exist and serverZone is EU', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        serverUrl: undefined,
        serverZone: ServerZone.EU,
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getApiHost(getConfig())).toBe(EU_AMPLITUDE_SERVER_URL);
  });

  test('should return EU batch server url if serverUrl does not exist, serverZone is EU and useBatch is set', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(
      new Config({
        apiKey: 'apiKey',
        transportProvider: useDefaultConfig().transportProvider,
        storageProvider: useDefaultConfig().storageProvider,
        saveEvents: false,
        optOut: true,
        useBatch: true,
        serverUrl: undefined,
        serverZone: ServerZone.EU,
      }),
    );
    expect(getConfig().saveEvents).toBe(false);
    expect(getConfig().optOut).toBe(true);
    expect(getConfig().useBatch).toBe(true);
    expect(getApiHost(getConfig())).toBe(EU_AMPLITUDE_BATCH_SERVER_URL);
  });
});
