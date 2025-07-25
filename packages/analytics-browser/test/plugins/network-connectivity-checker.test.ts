/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { networkConnectivityCheckerPlugin } from '../../src/plugins/network-connectivity-checker';
import * as AnalyticsCore from '@amplitude/analytics-core';

describe('networkConnectivityCheckerPlugin', () => {
  const amplitude = createAmplitudeMock();
  const config = createConfigurationMock();

  test('should set up correctly when online', async () => {
    const plugin = networkConnectivityCheckerPlugin();
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    await plugin.setup?.(config, amplitude);

    expect(config.offline).toEqual(false);
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  test('should set up correctly when offline', async () => {
    const plugin = networkConnectivityCheckerPlugin();
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    await plugin.setup?.(config, amplitude);

    expect(config.offline).toEqual(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  test('should teardown plugin', async () => {
    const plugin = networkConnectivityCheckerPlugin();
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    await plugin.setup?.(createConfigurationMock(), amplitude);
    await plugin.teardown?.();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  test('should do nothing when not on a browser', async () => {
    const plugin = networkConnectivityCheckerPlugin();
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
    const plugin = networkConnectivityCheckerPlugin();

    await expect(plugin.setup?.(config, amplitude)).resolves.not.toThrow();
    await expect(plugin.teardown?.()).resolves.not.toThrow();

    getGlobalScopeMock.mockRestore();
  });

  test('should not throw if globalScope.addEventListener is not available', async () => {
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({} as unknown as typeof globalThis);
    const plugin = networkConnectivityCheckerPlugin();

    await expect(plugin.setup?.(config, amplitude)).resolves.not.toThrow();
  });
});
