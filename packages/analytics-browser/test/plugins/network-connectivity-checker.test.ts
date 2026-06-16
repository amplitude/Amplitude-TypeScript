/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { networkConnectivityCheckerPlugin } from '../../src/plugins/network-connectivity-checker';
import * as AnalyticsCore from '@amplitude/analytics-core';
import type { BeforePlugin } from '@amplitude/analytics-core';

describe('networkConnectivityCheckerPlugin', () => {
  const amplitude = createAmplitudeMock();
  const config = createConfigurationMock();
  let plugins: BeforePlugin[];

  // Track every plugin so its network listeners can be torn down after each
  // test, preventing stale listeners from leaking across tests.
  const createPlugin = (): BeforePlugin => {
    const plugin = networkConnectivityCheckerPlugin();
    plugins.push(plugin);
    return plugin;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    plugins = [];
  });

  afterEach(async () => {
    for (const plugin of plugins) {
      await plugin.teardown?.();
    }
  });

  test('should set up correctly when online', async () => {
    const plugin = createPlugin();
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    await plugin.setup?.(config, amplitude);

    expect(config.offline).toEqual(false);
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  test('should set up correctly when offline', async () => {
    const plugin = createPlugin();
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    await plugin.setup?.(config, amplitude);

    expect(config.offline).toEqual(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  test('should flush when transitioning from offline to online', async () => {
    jest.useFakeTimers();
    const plugin = createPlugin();
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const onlineConfig = createConfigurationMock();

    await plugin.setup?.(onlineConfig, amplitude);
    expect(onlineConfig.offline).toEqual(true);

    window.dispatchEvent(new Event('online'));
    expect(onlineConfig.offline).toEqual(false);

    jest.advanceTimersByTime(onlineConfig.flushIntervalMillis);
    expect(amplitude.flush).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  test('should not flush on online event when already online', async () => {
    jest.useFakeTimers();
    const plugin = createPlugin();
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const onlineConfig = createConfigurationMock();

    await plugin.setup?.(onlineConfig, amplitude);
    expect(onlineConfig.offline).toEqual(false);

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));

    jest.advanceTimersByTime(onlineConfig.flushIntervalMillis);
    expect(amplitude.flush).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('should teardown plugin', async () => {
    const plugin = createPlugin();
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    await plugin.setup?.(createConfigurationMock(), amplitude);
    await plugin.teardown?.();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  test('should do nothing when not on a browser', async () => {
    const plugin = createPlugin();
    // @ts-expect-error we are mocking a node.js environment
    jest.spyOn(window, 'navigator', 'get').mockReturnValue(undefined);
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    await plugin.setup?.(config, amplitude);

    expect(config.offline).toEqual(false);
    expect(addEventListenerSpy).not.toHaveBeenCalled();
    addEventListenerSpy.mockRestore();
  });

  test('should not throw if addEventListener is not a function', async () => {
    const getGlobalScopeMock = jest
      .spyOn(AnalyticsCore, 'getGlobalScope')
      .mockReturnValue({} as unknown as typeof globalThis);
    const plugin = createPlugin();

    await expect(plugin.setup?.(config, amplitude)).resolves.not.toThrow();
    await expect(plugin.teardown?.()).resolves.not.toThrow();

    getGlobalScopeMock.mockRestore();
  });

  test('should not throw if globalScope.addEventListener is not available', async () => {
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({} as unknown as typeof globalThis);
    const plugin = createPlugin();

    await expect(plugin.setup?.(config, amplitude)).resolves.not.toThrow();
  });
});
