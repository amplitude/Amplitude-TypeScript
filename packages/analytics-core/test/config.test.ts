import { getConfig, createConfig, resetInstances } from '../src/config';
import { useDefaultConfig } from './helpers/default';

describe('config', () => {
  afterEach(() => {
    resetInstances();
  });

  test('should create new config', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(useDefaultConfig());
    expect(getConfig()).toBeDefined();
  });

  test('should create default config', () => {
    expect(getConfig()).toBeUndefined();
    createConfig({
      apiKey: 'apiKey',
      transportProvider: useDefaultConfig().transportProvider,
      storageProvider: useDefaultConfig().storageProvider,
    });
    expect(getConfig()).toBeDefined();
  });
});
