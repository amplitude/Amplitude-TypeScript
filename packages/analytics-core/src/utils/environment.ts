import { getGlobalScope } from '../global-scope';

export function isChromeExtension(): boolean {
  const globalScope = getGlobalScope() as { chrome?: { runtime?: { id?: string } } };
  return typeof globalScope?.chrome?.runtime?.id === 'string';
}

export function isReactNative(): boolean {
  const globalScope = getGlobalScope() as { navigator?: { product?: string } };
  return globalScope?.navigator?.product === 'ReactNative';
}

// Main-thread browser only. Workers have no `document` — use isWebWorker() for those.
export function isBrowser(): boolean {
  const globalScope = getGlobalScope() as { document?: unknown } | undefined;
  return typeof globalScope?.document !== 'undefined';
}

// True inside a dedicated / shared / service worker. `WorkerGlobalScope` is only exposed
// on worker globals, so its presence is already worker-specific; the instanceof check
// additionally rules out non-browser runtimes that expose web constructors on a server global.
export function isWebWorker(): boolean {
  const globalScope = getGlobalScope() as { WorkerGlobalScope?: new () => unknown } | undefined;
  if (!globalScope) {
    return false;
  }
  const workerGlobalScope = globalScope.WorkerGlobalScope;
  return typeof workerGlobalScope === 'function' && globalScope instanceof workerGlobalScope;
}

// A service worker global, including an MV3 extension background worker.
// ServiceWorkerGlobalScope inherits from WorkerGlobalScope, so isWebWorker() also matches
// here — check this one first when distinguishing the two.
export function isServiceWorker(): boolean {
  const globalScope = getGlobalScope() as { ServiceWorkerGlobalScope?: new () => unknown } | undefined;
  if (!globalScope) {
    return false;
  }
  const serviceWorkerGlobalScope = globalScope.ServiceWorkerGlobalScope;
  return typeof serviceWorkerGlobalScope === 'function' && globalScope instanceof serviceWorkerGlobalScope;
}

// Checks process.versions.node rather than bare `process`: bundlers commonly inject a
// process.env shim into browser builds, but not versions.node.
export function isNode(): boolean {
  const globalScope = getGlobalScope() as { process?: { versions?: { node?: unknown } } } | undefined;
  return typeof globalScope?.process?.versions?.node === 'string';
}

export type WebEnvironment =
  | 'browser'
  | 'web_worker'
  | 'service_worker'
  | 'chrome_extension'
  | 'chrome_extension_service_worker'
  | 'node'
  | 'unknown';

/**
 * Classifies the JS runtime for diagnostics. The check order is load-bearing:
 * - service worker before web worker: ServiceWorkerGlobalScope inherits from WorkerGlobalScope
 * - browser after the extension split: extension pages and content scripts have a `document`
 * - browser before node: jsdom exposes both `document` and `process.versions.node`
 */
export function getWebEnvironment(): WebEnvironment {
  if (!getGlobalScope()) {
    return 'unknown';
  }
  const isExtension = isChromeExtension();
  if (isServiceWorker()) {
    return isExtension ? 'chrome_extension_service_worker' : 'service_worker';
  }
  if (isWebWorker()) {
    return 'web_worker';
  }
  if (isBrowser()) {
    return isExtension ? 'chrome_extension' : 'browser';
  }
  if (isNode()) {
    return 'node';
  }
  return 'unknown';
}
