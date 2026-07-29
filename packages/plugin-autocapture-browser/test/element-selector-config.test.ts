import { BrowserConfig, ILogger } from '@amplitude/analytics-core';
import { DataExtractor } from '../src/data-extractor';
import { ELEMENT_SELECTOR_REMOTE_CONFIG_KEY, subscribeToElementSelectorConfig } from '../src/element-selector-config';

const loggerProvider: Partial<ILogger> = {
  log: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

const makeConfig = (overrides: Partial<BrowserConfig>): BrowserConfig =>
  ({
    loggerProvider: loggerProvider as ILogger,
    ...overrides,
  } as BrowserConfig);

describe('subscribeToElementSelectorConfig', () => {
  let dataExtractor: DataExtractor;

  beforeEach(() => {
    dataExtractor = new DataExtractor({});
  });

  it('returns undefined when fetchRemoteConfig is disabled', () => {
    const remoteConfigClient = { subscribe: jest.fn(), unsubscribe: jest.fn(), updateConfigs: jest.fn() };
    const cleanup = subscribeToElementSelectorConfig(
      makeConfig({ fetchRemoteConfig: false, remoteConfigClient }),
      dataExtractor,
    );
    expect(cleanup).toBeUndefined();
    expect(remoteConfigClient.subscribe).not.toHaveBeenCalled();
  });

  it('returns undefined when no remoteConfigClient is provided', () => {
    const cleanup = subscribeToElementSelectorConfig(makeConfig({ fetchRemoteConfig: true }), dataExtractor);
    expect(cleanup).toBeUndefined();
  });

  it('subscribes with the element-selector key, applies delivered config, and unsubscribes on cleanup', () => {
    const updateSpy = jest.spyOn(dataExtractor, 'updateSelectorConfig');
    let deliver: ((remoteConfig: unknown) => void) | undefined;
    const remoteConfigClient = {
      subscribe: jest.fn((_key: string, _mode: unknown, cb: (remoteConfig: unknown) => void) => {
        deliver = cb;
        return 'es-sub-id';
      }),
      unsubscribe: jest.fn(),
      updateConfigs: jest.fn(),
    };
    const config = makeConfig({
      fetchRemoteConfig: true,
      remoteConfigClient: remoteConfigClient as unknown as BrowserConfig['remoteConfigClient'],
    });

    const cleanup = subscribeToElementSelectorConfig(config, dataExtractor);

    expect(remoteConfigClient.subscribe).toHaveBeenCalledWith(
      ELEMENT_SELECTOR_REMOTE_CONFIG_KEY,
      'all',
      expect.any(Function),
    );

    // Deliver an enabled payload -> pushed into the extractor.
    deliver?.({ enabled: true });
    expect(updateSpy).toHaveBeenCalledWith({ enabled: true }, config.loggerProvider);

    // Deliver a null payload (no config for this key) -> still applied (defaults).
    deliver?.(null);
    expect(updateSpy).toHaveBeenCalledWith(null, config.loggerProvider);

    // Cleanup unsubscribes using the subscription id.
    expect(cleanup).toBeDefined();
    cleanup?.();
    expect(remoteConfigClient.unsubscribe).toHaveBeenCalledWith('es-sub-id');
  });
});
