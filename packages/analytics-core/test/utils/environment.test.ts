import * as analyticsCoreModule from '../../src/index';
import * as globalScopeModule from '../../src/global-scope';

type ChromeStub = { runtime?: { id?: string | number } };

describe('isChromeExtension', () => {
  const originalChrome = (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalChrome === undefined) {
      delete (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome;
    } else {
      (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome = originalChrome;
    }
  });

  test('returns false when globalScope is undefined', () => {
    jest.spyOn(globalScopeModule, 'getGlobalScope').mockReturnValue(undefined);
    expect(analyticsCoreModule.isChromeExtension()).toBe(false);
  });

  test('returns false when chrome is undefined', () => {
    delete (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome;
    expect(analyticsCoreModule.isChromeExtension()).toBe(false);
  });

  test('returns false when chrome.runtime is undefined', () => {
    (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome = {};
    expect(analyticsCoreModule.isChromeExtension()).toBe(false);
  });

  test('returns false when runtime.id is not a string', () => {
    (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome = { runtime: { id: 1 } };
    expect(analyticsCoreModule.isChromeExtension()).toBe(false);
  });

  test('returns true when chrome.runtime.id is a string', () => {
    (globalThis as typeof globalThis & { chrome?: ChromeStub }).chrome = { runtime: { id: 'ext-abc' } };
    expect(analyticsCoreModule.isChromeExtension()).toBe(true);
  });
});

describe('isReactNative', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns false when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(analyticsCoreModule.isReactNative()).toBe(false);
  });

  test('returns false when navigator is undefined', () => {
    getGlobalScopeSpy.mockReturnValue({});
    expect(analyticsCoreModule.isReactNative()).toBe(false);
  });

  test('returns false when navigator.product is not ReactNative', () => {
    getGlobalScopeSpy.mockReturnValue({ navigator: { product: 'NotReactNative' } });
    expect(analyticsCoreModule.isReactNative()).toBe(false);
  });

  test('returns true when navigator.product is ReactNative', () => {
    getGlobalScopeSpy.mockReturnValue({ navigator: { product: 'ReactNative' } });
    expect(analyticsCoreModule.isReactNative()).toBe(true);
  });
});
