import { BrowserClient, BrowserConfig, ILogger } from '@amplitude/analytics-core';
import { autocapturePlugin } from '../../src/autocapture-plugin';
import { createMockBrowserClient } from '../mock-browser-client';

type ElementSelectorSurface = {
  generate: (el: Element) => string;
  getConfig: () => { enabled: boolean };
  onConfigChange: (cb: (config: { enabled: boolean }) => void) => () => void;
};

type BrowserClientWithElementSelector = jest.Mocked<BrowserClient> & {
  elementSelector?: ElementSelectorSurface;
};

describe('autocapturePlugin - element selector integration', () => {
  let loggerProvider: ILogger;
  let instance: BrowserClientWithElementSelector;
  let remoteConfigCallbacks: Record<string, (remoteConfig: unknown) => void>;
  let remoteConfigClient: {
    subscribe: jest.Mock<string, [string, string, (remoteConfig: unknown) => void]>;
    unsubscribe: jest.Mock<boolean, [string]>;
  };

  beforeEach(() => {
    loggerProvider = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as ILogger;
    instance = createMockBrowserClient();
    remoteConfigCallbacks = {};
    remoteConfigClient = {
      subscribe: jest.fn((key, _deliveryMode, callback) => {
        remoteConfigCallbacks[key] = callback;
        return `${key}-subscription`;
      }),
      unsubscribe: jest.fn((_id: string) => true),
    };
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  const createConfig = (): BrowserConfig =>
    ({
      defaultTracking: false,
      fetchRemoteConfig: true,
      loggerProvider,
      remoteConfigClient,
    } as unknown as BrowserConfig);

  it('exposes an element selector surface and applies remote config updates', async () => {
    const plugin = autocapturePlugin();

    await plugin.setup?.(createConfig(), instance);

    expect(instance.elementSelector?.getConfig().enabled).toBe(false);
    expect(remoteConfigClient.subscribe).toHaveBeenCalledWith(
      'configs.analyticsSDK.autocapture.elementSelector',
      'all',
      expect.any(Function),
    );

    const onConfigChange = jest.fn();
    const unsubscribeConfigChange = instance.elementSelector?.onConfigChange(onConfigChange);

    remoteConfigCallbacks['configs.analyticsSDK.autocapture.elementSelector']({ enabled: true });

    document.body.innerHTML = '<section id="hero"><div><button>Click</button></div></section>';
    const button = document.querySelector('button') as Element;

    expect(instance.elementSelector?.getConfig().enabled).toBe(true);
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(instance.elementSelector?.generate(button)).toBe(
      'section#hero > div:nth-of-type(1) > button:nth-of-type(1)',
    );

    unsubscribeConfigChange?.();
    await plugin.teardown?.();
  });

  it('unsubscribes remote config callbacks and removes the exposed surface on teardown', async () => {
    const plugin = autocapturePlugin();

    await plugin.setup?.(createConfig(), instance);
    expect(instance.elementSelector).toBeDefined();

    await plugin.teardown?.();

    expect(remoteConfigClient.unsubscribe).toHaveBeenCalledWith('configs.analyticsSDK.pageActions-subscription');
    expect(remoteConfigClient.unsubscribe).toHaveBeenCalledWith(
      'configs.analyticsSDK.autocapture.elementSelector-subscription',
    );
    expect(Object.prototype.hasOwnProperty.call(instance, 'elementSelector')).toBe(false);
  });

  it('restores a pre-existing element selector surface on teardown', async () => {
    const previousSurface = {
      generate: jest.fn(() => 'previous'),
      getConfig: jest.fn(() => ({ enabled: true })),
      onConfigChange: jest.fn(() => jest.fn()),
    };
    instance.elementSelector = previousSurface;
    const plugin = autocapturePlugin();

    await plugin.setup?.(createConfig(), instance);
    expect(instance.elementSelector).not.toBe(previousSurface);

    await plugin.teardown?.();

    expect(instance.elementSelector).toBe(previousSurface);
  });
});
