import * as analyticsCoreModule from '../../src/index';
// Not part of the public API — imported from the module under test directly.
import { isBrowser, isClientSide, isWebWorker } from '../../src/utils/environment';
import * as globalScopeModule from '../../src/global-scope';

type ChromeStub = { runtime?: { id?: string | number } };

// Stands in for a worker global: an instance of the constructor it also exposes.
class FakeWorkerGlobalScope {
  WorkerGlobalScope = FakeWorkerGlobalScope;
}

const workerGlobalScope = () => new FakeWorkerGlobalScope() as unknown as typeof globalThis;

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

describe('isBrowser', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns false when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(isBrowser()).toBe(false);
  });

  test('returns false when document is undefined', () => {
    getGlobalScopeSpy.mockReturnValue({} as typeof globalThis);
    expect(isBrowser()).toBe(false);
  });

  test('returns true when document is defined', () => {
    getGlobalScopeSpy.mockReturnValue({ document: {} } as unknown as typeof globalThis);
    expect(isBrowser()).toBe(true);
  });
});

describe('isWebWorker', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns false when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(isWebWorker()).toBe(false);
  });

  test('returns false when WorkerGlobalScope is not exposed', () => {
    getGlobalScopeSpy.mockReturnValue({} as typeof globalThis);
    expect(isWebWorker()).toBe(false);
  });

  test('returns false when WorkerGlobalScope is exposed but the scope is not a worker', () => {
    // e.g. a server runtime that exposes web constructors on its global.
    getGlobalScopeSpy.mockReturnValue({
      WorkerGlobalScope: FakeWorkerGlobalScope,
    } as unknown as typeof globalThis);
    expect(isWebWorker()).toBe(false);
  });

  test('returns true inside a worker global scope', () => {
    getGlobalScopeSpy.mockReturnValue(workerGlobalScope());
    expect(isWebWorker()).toBe(true);
  });
});

describe('isClientSide', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns true in a React Native environment', () => {
    getGlobalScopeSpy.mockReturnValue({ navigator: { product: 'ReactNative' } } as unknown as typeof globalThis);
    expect(isClientSide()).toBe(true);
  });

  test('returns true in a browser environment', () => {
    getGlobalScopeSpy.mockReturnValue({ document: {} } as unknown as typeof globalThis);
    expect(isClientSide()).toBe(true);
  });

  test('returns true in a document-less browser worker', () => {
    // e.g. a Manifest V3 extension background service worker.
    getGlobalScopeSpy.mockReturnValue(workerGlobalScope());
    expect(isClientSide()).toBe(true);
  });

  test('returns true in a Chrome extension without document', () => {
    getGlobalScopeSpy.mockReturnValue({ chrome: { runtime: { id: 'ext-abc' } } } as unknown as typeof globalThis);
    expect(isClientSide()).toBe(true);
  });

  test('returns false in a server (Node) environment', () => {
    getGlobalScopeSpy.mockReturnValue({} as typeof globalThis);
    expect(isClientSide()).toBe(false);
  });
});
