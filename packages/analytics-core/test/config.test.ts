import { getConfig, createConfig, resetInstances, Config } from '../src/config';
import { useDefaultConfig } from './helpers/default';

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
      }),
    );
    expect(getConfig()).toBeDefined();
    expect(getConfig().saveEvents).toBe(false);
  });
});
