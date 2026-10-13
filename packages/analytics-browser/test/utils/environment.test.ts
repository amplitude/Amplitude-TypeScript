import * as core from '@amplitude/analytics-core';
import { getRuntimeEnvironment } from '../../src/utils/environment';

// Stands in for a worker global: an instance of the constructor it also exposes.
class FakeWorkerGlobalScope {
  WorkerGlobalScope = FakeWorkerGlobalScope;
}

// Mirrors the real inheritance: ServiceWorkerGlobalScope extends WorkerGlobalScope.
class FakeServiceWorkerGlobalScope extends FakeWorkerGlobalScope {
  ServiceWorkerGlobalScope = FakeServiceWorkerGlobalScope;
}

const asScope = (scope: unknown) => scope as typeof globalThis;
const workerGlobalScope = () => asScope(new FakeWorkerGlobalScope());
const serviceWorkerGlobalScope = () => asScope(new FakeServiceWorkerGlobalScope());

describe('getRuntimeEnvironment', () => {
  let getGlobalScopeSpy: jest.SpyInstance;

  beforeEach(() => {
    getGlobalScopeSpy = jest.spyOn(core, 'getGlobalScope');
  });

  afterEach(() => {
    getGlobalScopeSpy.mockRestore();
  });

  test('returns unknown when globalScope is undefined', () => {
    getGlobalScopeSpy.mockReturnValue(undefined);
    expect(getRuntimeEnvironment()).toBe('unknown');
  });

  test('returns service_worker in a service worker scope, not web_worker', () => {
    // The fake inherits from the worker scope like the real one, so this also
    // covers the service-worker-before-web-worker precedence.
    getGlobalScopeSpy.mockReturnValue(serviceWorkerGlobalScope());
    expect(getRuntimeEnvironment()).toBe('service_worker');
  });

  test('returns chrome_extension_service_worker in an MV3 extension background', () => {
    const scope = Object.assign(serviceWorkerGlobalScope(), { chrome: { runtime: { id: 'ext-abc' } } });
    getGlobalScopeSpy.mockReturnValue(scope);
    expect(getRuntimeEnvironment()).toBe('chrome_extension_service_worker');
  });

  test('returns web_worker in a dedicated or shared worker scope', () => {
    getGlobalScopeSpy.mockReturnValue(workerGlobalScope());
    expect(getRuntimeEnvironment()).toBe('web_worker');
  });

  test('returns browser when a document is present', () => {
    getGlobalScopeSpy.mockReturnValue(asScope({ document: {} }));
    expect(getRuntimeEnvironment()).toBe('browser');
  });

  test('returns chrome_extension for extension pages and content scripts', () => {
    getGlobalScopeSpy.mockReturnValue(asScope({ document: {}, chrome: { runtime: { id: 'ext-abc' } } }));
    expect(getRuntimeEnvironment()).toBe('chrome_extension');
  });

  test('returns browser when chrome.runtime.id is not a string', () => {
    getGlobalScopeSpy.mockReturnValue(asScope({ document: {}, chrome: { runtime: { id: 1 } } }));
    expect(getRuntimeEnvironment()).toBe('browser');
  });

  test('ignores worker constructors the scope is not an instance of', () => {
    // e.g. a server runtime that exposes web constructors on its global.
    getGlobalScopeSpy.mockReturnValue(
      asScope({
        ServiceWorkerGlobalScope: FakeServiceWorkerGlobalScope,
        WorkerGlobalScope: FakeWorkerGlobalScope,
        document: {},
      }),
    );
    expect(getRuntimeEnvironment()).toBe('browser');
  });

  test('returns node when process.versions.node is present without a document', () => {
    getGlobalScopeSpy.mockReturnValue(asScope({ process: { versions: { node: '20.0.0' } } }));
    expect(getRuntimeEnvironment()).toBe('node');
  });

  test('returns unknown when nothing matches', () => {
    getGlobalScopeSpy.mockReturnValue(asScope({}));
    expect(getRuntimeEnvironment()).toBe('unknown');
  });

  test('returns unknown for shim-only chrome and process objects', () => {
    // chrome without runtime; a bundler-injected process.env shim without versions.node.
    getGlobalScopeSpy.mockReturnValue(asScope({ chrome: {}, process: { env: {} } }));
    expect(getRuntimeEnvironment()).toBe('unknown');
  });
});
