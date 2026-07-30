import * as analyticsCoreModule from '../../src/index';
// Not part of the public API — imported from the module under test directly.
import { isBrowser, isNode, isServiceWorker, isWebWorker } from '../../src/utils/environment';
import * as globalScopeModule from '../../src/global-scope';

type ChromeStub = { runtime?: { id?: string | number } };

// Stands in for a worker global: an instance of the constructor it also exposes.
class FakeWorkerGlobalScope {
  WorkerGlobalScope = FakeWorkerGlobalScope;
}

// Mirrors the real inheritance: ServiceWorkerGlobalScope extends WorkerGlobalScope.
class FakeServiceWorkerGlobalScope extends FakeWorkerGlobalScope {
  ServiceWorkerGlobalScope = FakeServiceWorkerGlobalScope;
}

const workerGlobalScope = () => new FakeWorkerGlobalScope() as unknown as typeof globalThis;
const serviceWorkerGlobalScope = () => new FakeServiceWorkerGlobalScope() as unknown as typeof globalThis;

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

describe('isServiceWorker', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns false when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(isServiceWorker()).toBe(false);
  });

  test('returns false when ServiceWorkerGlobalScope is not exposed', () => {
    getGlobalScopeSpy.mockReturnValue({} as typeof globalThis);
    expect(isServiceWorker()).toBe(false);
  });

  test('returns false when ServiceWorkerGlobalScope is exposed but the scope is not a service worker', () => {
    getGlobalScopeSpy.mockReturnValue({
      ServiceWorkerGlobalScope: FakeServiceWorkerGlobalScope,
    } as unknown as typeof globalThis);
    expect(isServiceWorker()).toBe(false);
  });

  test('returns false inside a dedicated worker global scope', () => {
    getGlobalScopeSpy.mockReturnValue(workerGlobalScope());
    expect(isServiceWorker()).toBe(false);
  });

  test('returns true inside a service worker global scope', () => {
    getGlobalScopeSpy.mockReturnValue(serviceWorkerGlobalScope());
    expect(isServiceWorker()).toBe(true);
  });
});

describe('isNode', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns false when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(isNode()).toBe(false);
  });

  test('returns false when process is undefined', () => {
    getGlobalScopeSpy.mockReturnValue({} as typeof globalThis);
    expect(isNode()).toBe(false);
  });

  test('returns false when process.versions is undefined', () => {
    // e.g. a bundler-injected process.env shim in a browser build.
    getGlobalScopeSpy.mockReturnValue({ process: { env: {} } } as unknown as typeof globalThis);
    expect(isNode()).toBe(false);
  });

  test('returns false when process.versions.node is not a string', () => {
    getGlobalScopeSpy.mockReturnValue({ process: { versions: { node: 20 } } } as unknown as typeof globalThis);
    expect(isNode()).toBe(false);
  });

  test('returns true when process.versions.node is a string', () => {
    getGlobalScopeSpy.mockReturnValue({ process: { versions: { node: '20.0.0' } } } as unknown as typeof globalThis);
    expect(isNode()).toBe(true);
  });
});

describe('getWebEnvironment', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(globalScopeModule, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns unknown when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(analyticsCoreModule.getWebEnvironment()).toBe('unknown');
  });

  test('returns service_worker in a service worker scope, not web_worker', () => {
    // The fake inherits from the worker scope like the real one, so this also
    // covers the service-worker-before-web-worker precedence.
    getGlobalScopeSpy.mockReturnValue(serviceWorkerGlobalScope());
    expect(analyticsCoreModule.getWebEnvironment()).toBe('service_worker');
  });

  test('returns chrome_extension_service_worker in an MV3 extension background', () => {
    const scope = Object.assign(serviceWorkerGlobalScope(), { chrome: { runtime: { id: 'ext-abc' } } });
    getGlobalScopeSpy.mockReturnValue(scope);
    expect(analyticsCoreModule.getWebEnvironment()).toBe('chrome_extension_service_worker');
  });

  test('returns web_worker in a dedicated or shared worker scope', () => {
    getGlobalScopeSpy.mockReturnValue(workerGlobalScope());
    expect(analyticsCoreModule.getWebEnvironment()).toBe('web_worker');
  });

  test('returns browser when a document is present', () => {
    getGlobalScopeSpy.mockReturnValue({ document: {} } as unknown as typeof globalThis);
    expect(analyticsCoreModule.getWebEnvironment()).toBe('browser');
  });

  test('returns chrome_extension for extension pages and content scripts', () => {
    getGlobalScopeSpy.mockReturnValue({
      document: {},
      chrome: { runtime: { id: 'ext-abc' } },
    } as unknown as typeof globalThis);
    expect(analyticsCoreModule.getWebEnvironment()).toBe('chrome_extension');
  });

  test('returns node when process.versions.node is present without a document', () => {
    getGlobalScopeSpy.mockReturnValue({ process: { versions: { node: '20.0.0' } } } as unknown as typeof globalThis);
    expect(analyticsCoreModule.getWebEnvironment()).toBe('node');
  });

  test('returns unknown when nothing matches', () => {
    getGlobalScopeSpy.mockReturnValue({} as typeof globalThis);
    expect(analyticsCoreModule.getWebEnvironment()).toBe('unknown');
  });
});
